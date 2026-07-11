import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applicationChangeRequests,
  applications,
  auditLogs,
  files,
  payments,
  profiles,
} from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { isDetectedTypeAllowed } from "@/lib/validation/application";
import { assertSameOrigin } from "@/server/security/request";
export const runtime = "nodejs";
const schema = z.object({ applicationId: z.uuid(), fileId: z.uuid() });
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { ok: false, message: "Sign in required." },
        { status: 401 },
      );
    const input = schema.parse(await request.json());
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile) throw new Error("Access denied.");
    const [record] = await db
      .select({ application: applications, file: files })
      .from(applications)
      .innerJoin(files, eq(files.id, input.fileId))
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.ownerProfileId, profile.id),
          eq(files.createdByProfileId, profile.id),
        ),
      )
      .limit(1);
    if (!record) throw new Error("Upload record not found.");
    if (record.file.status === "ready")
      return NextResponse.json({ ok: true, data: { fileId: record.file.id } });
    if (
      record.file.purpose === "payment_proof" &&
      record.application.paymentStatus !== "rejected"
    )
      throw new Error("A replacement payment proof is no longer requested.");
    if (record.file.purpose === "requested_document") {
      const [open] = await db
        .select({
          id: applicationChangeRequests.id,
          requestedFileKinds: applicationChangeRequests.requestedFileKinds,
        })
        .from(applicationChangeRequests)
        .where(
          and(
            eq(applicationChangeRequests.applicationId, record.application.id),
            eq(applicationChangeRequests.status, "open"),
          ),
        )
        .limit(1);
      if (!open?.requestedFileKinds.includes("requested_document"))
        throw new Error("A supporting document is no longer requested.");
    }
    const r2 = getR2();
    const head = await r2.send(
      new HeadObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: record.file.objectKey,
      }),
    );
    if (head.ContentLength !== record.file.sizeBytes)
      throw new Error("The uploaded file size did not match.");
    const object = await r2.send(
      new GetObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: record.file.objectKey,
        Range: "bytes=0-8191",
      }),
    );
    const bytes = await object.Body?.transformToByteArray();
    const detected = bytes ? await fileTypeFromBuffer(bytes) : undefined;
    if (
      !detected ||
      !isDetectedTypeAllowed(
        record.file.purpose as "payment_proof" | "requested_document",
        record.file.mimeTypeClaimed ?? "",
        detected.mime,
      )
    )
      throw new Error("The uploaded file contents are not an accepted type.");
    const now = new Date();
    await db.transaction(async (tx) => {
      const fileUpdated = await tx
        .update(files)
        .set({
          status: "ready",
          mimeTypeDetected: detected.mime,
          etag: head.ETag,
          validatedAt: now,
          updatedAt: now,
        })
        .where(and(eq(files.id, record.file.id), eq(files.status, "pending")))
        .returning({ id: files.id });
      if (!fileUpdated.length)
        throw new Error("This upload was already finalised.");
      if (record.file.purpose === "payment_proof") {
        await tx
          .update(applicationFiles)
          .set({ isCurrent: false })
          .where(
            and(
              eq(applicationFiles.applicationId, record.application.id),
              eq(applicationFiles.kind, "payment_proof"),
              eq(applicationFiles.isCurrent, true),
            ),
          );
        const [link] = await tx
          .insert(applicationFiles)
          .values({
            applicationId: record.application.id,
            fileId: record.file.id,
            kind: "payment_proof",
            isCurrent: true,
            uploadedByProfileId: profile.id,
          })
          .returning({ id: applicationFiles.id });
        const paymentUpdated = await tx
          .update(payments)
          .set({
            status: "proof_submitted",
            proofApplicationFileId: link.id,
            rejectedReason: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(payments.applicationId, record.application.id),
              eq(payments.status, "rejected"),
            ),
          )
          .returning({ id: payments.id });
        if (!paymentUpdated.length)
          throw new Error(
            "The payment request changed while this file was uploading.",
          );
        const applicationUpdated = await tx
          .update(applications)
          .set({
            paymentStatus: "proof_submitted",
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(applications.id, record.application.id),
              eq(applications.paymentStatus, "rejected"),
            ),
          )
          .returning({ id: applications.id });
        if (!applicationUpdated.length)
          throw new Error(
            "The application payment state changed while this file was uploading.",
          );
      } else
        await tx.insert(applicationFiles).values({
          applicationId: record.application.id,
          fileId: record.file.id,
          kind: "requested_document",
          isCurrent: true,
          uploadedByProfileId: profile.id,
        });
      await tx.insert(auditLogs).values({
        actorProfileId: profile.id,
        actorType: "applicant",
        action: `${record.file.purpose} uploaded`,
        entityType: "file",
        entityId: record.file.id,
        applicationId: record.application.id,
        metadataRedacted: {
          mimeType: detected.mime,
          sizeBytes: record.file.sizeBytes,
        },
        requestId: crypto.randomUUID(),
      });
    });
    return NextResponse.json({ ok: true, data: { fileId: record.file.id } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The upload could not be confirmed.",
      },
      { status: 400 },
    );
  }
}
