import { createHash, randomInt } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  applicationFiles,
  applicationStatusHistory,
  applications,
  applicationVersions,
  auditLogs,
  awardCycles,
  cycleSequences,
  emailOutbox,
  files,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";
import {
  fileManifestItemSchema,
  isDetectedTypeAllowed,
} from "@/lib/validation/application";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import { z } from "zod";
import { requireFeatureFlag } from "@/server/services/feature-flags";

export const runtime = "nodejs";
const inputSchema = z.object({
  sessionToken: z.string(),
  idempotencyKey: z.uuid(),
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "cause" in error &&
  typeof error.cause === "object" &&
  error.cause !== null &&
  "code" in error.cause &&
  error.cause.code === "23505";
export async function POST(request: Request) {
  scheduleEmailOutboxProcessing();
  const requestId = crypto.randomUUID();
  try {
    await assertSameOrigin();
    await requireFeatureFlag("applications_enabled");
    const input = inputSchema.parse(await request.json());
    const [applicationId, token] = input.sessionToken.split(".");
    if (!applicationId || !token)
      throw new Error("The upload session is invalid or expired.");
    await enforceRateLimit(`public-complete:${applicationId}`, 10, 1800);
    const db = getDb();
    const rows = await db
      .select({
        session: uploadSessions,
        application: applications,
        cycle: awardCycles,
      })
      .from(uploadSessions)
      .innerJoin(
        applications,
        eq(uploadSessions.applicationId, applications.id),
      )
      .innerJoin(awardCycles, eq(applications.cycleId, awardCycles.id))
      .where(
        and(
          eq(uploadSessions.applicationId, applicationId),
          eq(uploadSessions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || row.session.publicTokenHash !== hash(token))
      throw new Error("The upload session is invalid or expired.");
    if (row.session.status === "completed" && row.application.reference)
      return NextResponse.json({
        ok: true,
        data: { reference: row.application.reference },
      });
    if (row.session.expiresAt < new Date())
      throw new Error(
        "The upload session expired. Your entered details remain on this page; please submit again.",
      );
    if (row.cycle.status !== "open" || new Date() > row.cycle.closesAt)
      throw new Error("Nominations are no longer open for completion.");
    const manifest = z
      .array(fileManifestItemSchema)
      .parse(row.session.expectedManifest);
    const r2 = getR2();
    const readyFiles: Array<{
      id: string;
      kind: "supporting_document" | "payment_proof";
      key: string;
      name: string;
      size: number;
      claimed: string;
      detected: string;
      etag?: string;
    }> = [];
    for (const item of manifest) {
      const key = r2ObjectKey(
        `${item.kind === "payment_proof" ? "payment-proofs" : "applications"}/${row.cycle.year}/${row.application.id}/${item.id}`,
      );
      const head = await r2.send(
        new HeadObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET, Key: key }),
      );
      if (head.ContentLength !== item.size)
        throw new Error(`${item.name} did not upload completely.`);
      const object = await r2.send(
        new GetObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: key,
          Range: "bytes=0-8191",
        }),
      );
      const bytes = await object.Body?.transformToByteArray();
      const detected = bytes ? await fileTypeFromBuffer(bytes) : undefined;
      if (
        !detected ||
        !isDetectedTypeAllowed(item.kind, item.type, detected.mime)
      )
        throw new Error(`${item.name} does not match an accepted file type.`);
      readyFiles.push({
        id: item.id,
        kind: item.kind,
        key,
        name: item.name,
        size: item.size,
        claimed: item.type,
        detected: detected.mime,
        etag: head.ETag,
      });
    }
    const reference = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(uploadSessions)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(uploadSessions.id, row.session.id),
            eq(uploadSessions.status, "uploading"),
          ),
        )
        .returning({ id: uploadSessions.id });
      if (!claimed.length) {
        const [completed] = await tx
          .select({ reference: applications.reference })
          .from(applications)
          .where(eq(applications.id, row.application.id))
          .limit(1);
        if (completed?.reference) return completed.reference;
        throw new Error("This upload session is already being finalised.");
      }
      await tx
        .insert(cycleSequences)
        .values({
          cycleId: row.cycle.id,
          nextApplicationNumber: 2,
          nextPaymentNumber: 2,
        })
        .onConflictDoUpdate({
          target: cycleSequences.cycleId,
          set: {
            nextApplicationNumber: sql`${cycleSequences.nextApplicationNumber}+1`,
            nextPaymentNumber: sql`${cycleSequences.nextPaymentNumber}+1`,
            updatedAt: new Date(),
          },
        });
      const [sequence] = await tx
        .select({
          nextApplication: cycleSequences.nextApplicationNumber,
          nextPayment: cycleSequences.nextPaymentNumber,
        })
        .from(cycleSequences)
        .where(eq(cycleSequences.cycleId, row.cycle.id));
      const paymentNumber = Math.max(1, sequence.nextPayment - 1);
      let reference: string | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = `GBE-${row.cycle.year}-${randomInt(100000, 1_000_000)}`;
        try {
          const [claimedReference] = await tx.transaction(async (savepoint) =>
            savepoint
              .update(applications)
              .set({ reference: candidate, updatedAt: new Date() })
              .where(
                and(
                  eq(applications.id, row.application.id),
                  eq(applications.workflowStatus, "uploading"),
                  isNull(applications.reference),
                ),
              )
              .returning({ id: applications.id }),
          );
          if (claimedReference) {
            reference = candidate;
            break;
          }
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      if (!reference)
        throw new Error("We could not allocate a unique nomination reference.");
      const paymentReference = `PAY-${row.cycle.year}-${String(paymentNumber).padStart(6, "0")}`;
      await tx
        .update(payments)
        .set({ paymentReference, updatedAt: new Date() })
        .where(eq(payments.applicationId, row.application.id));
      for (const item of readyFiles) {
        const [stored] = await tx
          .insert(files)
          .values({
            bucket: "private",
            objectKey: item.key,
            purpose: item.kind,
            status: "ready",
            originalFilename: item.name,
            safeDownloadFilename: item.name.replace(/[^a-zA-Z0-9._ -]/g, "_"),
            mimeTypeClaimed: item.claimed,
            mimeTypeDetected: item.detected,
            sizeBytes: item.size,
            etag: item.etag,
            createdViaPublicSubmission: true,
            validatedAt: new Date(),
          })
          .returning({ id: files.id });
        const [link] = await tx
          .insert(applicationFiles)
          .values({
            applicationId: row.application.id,
            fileId: stored.id,
            kind: item.kind,
          })
          .returning({ id: applicationFiles.id });
        if (item.kind === "payment_proof")
          await tx
            .update(payments)
            .set({ proofApplicationFileId: link.id, updatedAt: new Date() })
            .where(eq(payments.applicationId, row.application.id));
      }
      const submittedAt = new Date();
      const snapshot = {
        nomineeName: row.application.nomineeName,
        designation: row.application.designation,
        awardNomination: row.application.awardNomination,
        businessWebsite: row.application.businessWebsite,
        email: row.application.emailDisplay,
        phone: row.application.phoneDisplay,
        categoryName: row.application.categoryNameSnapshot,
        submittedAt: submittedAt.toISOString(),
      };
      await tx.insert(applicationVersions).values({
        applicationId: row.application.id,
        version: 1,
        source: "public_submission",
        payload: snapshot,
      });
      const updatedApplication = await tx
        .update(applications)
        .set({
          workflowStatus: "submitted",
          submittedAt,
          currentVersion: 1,
          lastActivityAt: submittedAt,
          updatedAt: submittedAt,
        })
        .where(
          and(
            eq(applications.id, row.application.id),
            eq(applications.workflowStatus, "uploading"),
          ),
        )
        .returning({ id: applications.id });
      if (!updatedApplication.length)
        throw new Error("This nomination was already finalised.");
      await tx.insert(applicationStatusHistory).values({
        applicationId: row.application.id,
        fromStatus: "uploading",
        toStatus: "submitted",
        applicantLabel: "Nomination received",
        applicantMessage:
          "Your nomination has been received for administrative review.",
        isSystemAction: true,
        effectiveAt: submittedAt,
      });
      await tx
        .update(uploadSessions)
        .set({
          status: "completed",
          completedAt: submittedAt,
          updatedAt: submittedAt,
        })
        .where(eq(uploadSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorType: "public",
        action: "application submitted",
        entityType: "application",
        entityId: row.application.id,
        applicationId: row.application.id,
        afterRedacted: { reference, paymentReference },
        metadataRedacted: { fileCount: readyFiles.length },
        requestId,
      });
      await tx.insert(emailOutbox).values({
        templateKey: "nomination_received",
        recipientEmail: row.application.emailNormalised,
        applicationId: row.application.id,
        payload: {
          reference,
          paymentReference,
          nomineeName: row.application.nomineeName,
        },
        idempotencyKey: `nomination_received:${row.application.id}:1`,
      });
      await tx.insert(emailOutbox).values({
        templateKey: "admin_nomination_received",
        recipientEmail: env.SUPPORT_EMAIL,
        applicationId: row.application.id,
        payload: {
          title: "New GBE Awards nomination",
          reference,
          nomineeName: row.application.nomineeName,
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/applications/${row.application.id}`,
        },
        idempotencyKey: `admin_nomination_received:${row.application.id}:1`,
      });
      return reference;
    });
    return NextResponse.json({ ok: true, data: { reference } });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        action: "public application complete",
        requestId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "We could not confirm your nomination. Please try again.",
        errorId: requestId,
        retryable: true,
      },
      { status: 400 },
    );
  }
}
