"use server";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import {
  applicationFiles,
  applications,
  auditLogs,
  emailOutbox,
  files,
  payments,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";

export async function setFileDispositionAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "files.manage"))
    throw new Error("File-management permission is required.");
  const input = z
    .object({
      fileId: z.uuid(),
      mode: z.enum(["reject", "supersede", "delete"]),
      reason: z.string().trim().min(8).max(1000),
    })
    .parse(Object.fromEntries(formData));
  if (input.mode === "delete" && membership.role !== "super_admin")
    throw new Error("Super-administrator permission is required for deletion.");
  await enforceRateLimit(`file-admin:${profile.id}`, 40, 3600);
  const db = getDb();
  const [record] = await db
    .select({ file: files, link: applicationFiles, application: applications })
    .from(files)
    .leftJoin(applicationFiles, eq(applicationFiles.fileId, files.id))
    .leftJoin(applications, eq(applicationFiles.applicationId, applications.id))
    .where(eq(files.id, input.fileId))
    .limit(1);
  if (!record) throw new Error("File not found.");
  if (
    record.application &&
    !hasPermission(membership, "applications.view_all") &&
    record.application.assignedReviewerId !== profile.id
  )
    throw new Error("File not found or not assigned to you.");

  if (input.mode === "delete") {
    if (record.link?.isCurrent)
      throw new Error(
        "A current application file must be rejected or superseded before retention deletion.",
      );
    if (!["superseded", "rejected"].includes(record.file.status))
      throw new Error("Only rejected or superseded files may be deleted.");
    await db
      .update(files)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(eq(files.id, record.file.id), eq(files.status, record.file.status)),
      );
    await getR2().send(
      new DeleteObjectCommand({
        Bucket:
          record.file.bucket === "private"
            ? env.R2_PRIVATE_BUCKET
            : env.R2_PUBLIC_BUCKET,
        Key: record.file.objectKey,
      }),
    );
    await db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(files.id, record.file.id));
      await tx.insert(auditLogs).values({
        actorProfileId: profile.id,
        actorType: "staff",
        action: "file deleted under retention authority",
        entityType: "file",
        entityId: record.file.id,
        applicationId: record.application?.id,
        beforeRedacted: { status: record.file.status },
        afterRedacted: { status: "deleted" },
        reason: input.reason,
        metadataRedacted: { purpose: record.file.purpose },
        requestId: crypto.randomUUID(),
      });
    });
  } else {
    const nextStatus = input.mode === "reject" ? "rejected" : "superseded";
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(files)
        .set({
          status: nextStatus,
          rejectionReason: input.mode === "reject" ? input.reason : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(files.id, record.file.id),
            eq(files.status, record.file.status),
          ),
        )
        .returning({ id: files.id });
      if (!updated.length)
        throw new Error("The file changed while you were reviewing it.");
      if (record.link?.isCurrent)
        await tx
          .update(applicationFiles)
          .set({ isCurrent: false })
          .where(eq(applicationFiles.id, record.link.id));
      if (
        input.mode === "reject" &&
        record.link?.kind === "payment_proof" &&
        record.application
      ) {
        await tx
          .update(payments)
          .set({
            status: "rejected",
            rejectedReason: input.reason,
            proofApplicationFileId: null,
            updatedAt: new Date(),
          })
          .where(eq(payments.applicationId, record.application.id));
        await tx
          .update(applications)
          .set({ paymentStatus: "rejected", updatedAt: new Date() })
          .where(eq(applications.id, record.application.id));
        await tx.insert(emailOutbox).values({
          templateKey: "payment_rejected",
          recipientEmail: record.application.emailNormalised,
          recipientProfileId: record.application.ownerProfileId,
          applicationId: record.application.id,
          payload: {
            reference: record.application.reference,
            message: input.reason,
            url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/payment`,
          },
          idempotencyKey: `file_rejected:${record.file.id}`,
        });
      }
      await tx.insert(auditLogs).values({
        actorProfileId: profile.id,
        actorType: "staff",
        action: `file marked ${nextStatus}`,
        entityType: "file",
        entityId: record.file.id,
        applicationId: record.application?.id,
        beforeRedacted: {
          status: record.file.status,
          current: record.link?.isCurrent ?? false,
        },
        afterRedacted: { status: nextStatus, current: false },
        reason: input.reason,
        metadataRedacted: { purpose: record.file.purpose },
        requestId: crypto.randomUUID(),
      });
    });
  }
  revalidatePath("/admin/files");
  if (record.application)
    revalidatePath(`/admin/applications/${record.application.id}`);
}
