import { queueNominationReceived } from "@/server/services/nomination-notifications";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  auditLogs,
  files,
  paymentAttempts,
  payments,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";
import {
  MAX_FILE_SIZE,
  isDetectedTypeAllowed,
  isExtensionAllowed,
  paymentTypes,
} from "@/lib/validation/application";
import { requirePaymentSession } from "@/server/security/payment-session";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { paymentErrorMessage } from "@/lib/domain/genie";

export const runtime = "nodejs";
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    name: z.string().min(1).max(255),
    type: z.enum(paymentTypes),
    size: z.number().int().positive().max(MAX_FILE_SIZE),
  }),
  z.object({ action: z.literal("complete"), fileId: z.uuid() }),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    await assertSameOrigin();
    const { applicationId } = await context.params;
    const { payment } = await requirePaymentSession(applicationId);
    const input = inputSchema.parse(await request.json());
    await enforceRateLimit(`public-payment-proof:${applicationId}`, 20, 900);
    const db = getDb();
    const prefix = r2ObjectKey(`payment-proofs/checkout/${applicationId}/`);
    if (input.action === "complete" && payment.proofApplicationFileId) {
      const [existing] = await db
        .select()
        .from(applicationFiles)
        .where(
          and(
            eq(applicationFiles.id, payment.proofApplicationFileId),
            eq(applicationFiles.fileId, input.fileId),
          ),
        );
      if (existing) return NextResponse.json({ ok: true });
    }
    if (
      payment.method !== "bank_transfer" ||
      !["awaiting_payment", "rejected"].includes(payment.status)
    )
      throw new Error("Select bank transfer before uploading a payment slip.");
    if (input.action === "prepare") {
      if (!isExtensionAllowed(input.name, input.type))
        throw new Error("Choose a PDF, JPEG, PNG or WebP file.");
      const [file] = await db
        .insert(files)
        .values({
          bucket: "private",
          objectKey: `${prefix}${crypto.randomUUID()}`,
          purpose: "payment_proof",
          status: "pending",
          originalFilename: input.name,
          safeDownloadFilename: input.name.replace(/[^a-zA-Z0-9._ -]/g, "_"),
          sizeBytes: input.size,
          mimeTypeClaimed: input.type,
          createdViaPublicSubmission: true,
        })
        .returning();
      const url = await getSignedUrl(
        getR2(),
        new PutObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: file.objectKey,
          ContentLength: input.size,
          ContentType: input.type,
        }),
        { expiresIn: 600 },
      );
      return NextResponse.json({
        ok: true,
        data: { fileId: file.id, url, headers: { "content-type": input.type } },
      });
    }
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, input.fileId),
          eq(files.status, "pending"),
          eq(files.purpose, "payment_proof"),
        ),
      );
    if (
      !file?.objectKey.startsWith(prefix) ||
      file.createdAt < new Date(Date.now() - 30 * 60_000)
    )
      throw new Error("This upload expired. Select the file again.");
    const head = await getR2().send(
      new HeadObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: file.objectKey,
      }),
    );
    if (head.ContentLength !== file.sizeBytes)
      throw new Error("The upload is incomplete. Please retry.");
    const object = await getR2().send(
      new GetObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: file.objectKey,
        Range: "bytes=0-8191",
      }),
    );
    const bytes = await object.Body?.transformToByteArray();
    const detected = bytes ? await fileTypeFromBuffer(bytes) : undefined;
    if (
      !detected ||
      !isDetectedTypeAllowed(
        "payment_proof",
        file.mimeTypeClaimed ?? "",
        detected.mime,
      )
    )
      throw new Error(
        "The file contents do not match an accepted payment proof format.",
      );
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for("update");
      const [active] = await tx
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.paymentId, payment.id),
            eq(paymentAttempts.active, true),
          ),
        );
      if (
        active ||
        current.method !== "bank_transfer" ||
        !["awaiting_payment", "rejected"].includes(current.status)
      )
        throw new Error(
          "Your payment changed while uploading. Check its status before continuing.",
        );
      const now = new Date();
      const updated = await tx
        .update(files)
        .set({
          status: "ready",
          mimeTypeDetected: detected.mime,
          validatedAt: now,
          updatedAt: now,
          etag: head.ETag,
        })
        .where(and(eq(files.id, file.id), eq(files.status, "pending")))
        .returning();
      if (!updated.length)
        throw new Error(
          "The upload was already completed. Refresh payment status.",
        );
      await tx
        .update(applicationFiles)
        .set({ isCurrent: false })
        .where(
          and(
            eq(applicationFiles.applicationId, applicationId),
            eq(applicationFiles.kind, "payment_proof"),
          ),
        );
      const [link] = await tx
        .insert(applicationFiles)
        .values({
          applicationId,
          fileId: file.id,
          kind: "payment_proof",
          isCurrent: true,
        })
        .returning();
      await tx
        .update(payments)
        .set({
          status: "proof_submitted",
          proofApplicationFileId: link.id,
          rejectedReason: null,
          updatedAt: now,
        })
        .where(eq(payments.id, payment.id));
      await tx
        .update(applications)
        .set({
          paymentStatus: "proof_submitted",
          updatedAt: now,
          lastActivityAt: now,
        })
        .where(eq(applications.id, applicationId));
      await tx.insert(auditLogs).values({
        actorType: "public",
        action: "bank transfer proof submitted",
        entityType: "payment",
        entityId: payment.id,
        applicationId,
        metadataRedacted: { fileId: file.id },
        requestId: crypto.randomUUID(),
      });
      await queueNominationReceived(tx, applicationId);
    });
    scheduleEmailOutboxProcessing();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: paymentErrorMessage(error) },
      { status: 400 },
    );
  }
}
