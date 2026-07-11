import "server-only";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, gt, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  applications,
  auditLogs,
  awardCycles,
  emailOutbox,
  exportsTable,
  files,
  invitations,
  rateLimitBuckets,
  systemSettings,
  uploadSessions,
  verification,
} from "@/lib/db/schema";
import { getR2, r2ObjectKey } from "@/lib/r2/client";
import { env } from "@/lib/env";
export async function cleanupStaleUploads() {
  const db = getDb();
  const expired = await db
    .select()
    .from(uploadSessions)
    .where(
      and(
        lt(uploadSessions.expiresAt, new Date()),
        eq(uploadSessions.status, "uploading"),
      ),
    )
    .limit(100);
  for (const session of expired) {
    const manifest = session.expectedManifest as Array<{
      id: string;
      kind: string;
    }>;
    const [application] = await db
      .select({ application: applications, cycle: awardCycles })
      .from(applications)
      .innerJoin(awardCycles, eq(applications.cycleId, awardCycles.id))
      .where(eq(applications.id, session.applicationId))
      .limit(1);
    if (application)
      for (const item of manifest) {
        const key = r2ObjectKey(
          `${item.kind === "payment_proof" ? "payment-proofs" : "applications"}/${application.cycle.year}/${application.application.id}/${item.id}`,
        );
        await getR2().send(
          new DeleteObjectCommand({
            Bucket: env.R2_PRIVATE_BUCKET,
            Key: key,
          }),
        );
      }
    await db
      .update(uploadSessions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(uploadSessions.id, session.id));
  }
  const pendingFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.status, "pending"),
        lt(files.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    )
    .limit(100);
  for (const file of pendingFiles) {
    await getR2().send(
      new DeleteObjectCommand({
        Bucket:
          file.bucket === "private"
            ? env.R2_PRIVATE_BUCKET
            : env.R2_PUBLIC_BUCKET,
        Key: file.objectKey,
      }),
    );
    await db
      .update(files)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(files.id, file.id));
  }
  return {
    expiredSessions: expired.length,
    deletedPendingFiles: pendingFiles.length,
  };
}
export async function cleanupExpiredExports() {
  const db = getDb();
  const expired = await db
    .select({ export: exportsTable, file: files })
    .from(exportsTable)
    .innerJoin(files, eq(exportsTable.fileId, files.id))
    .where(
      and(
        lt(exportsTable.expiresAt, new Date()),
        eq(exportsTable.status, "ready"),
      ),
    )
    .limit(100);
  for (const row of expired) {
    await getR2().send(
      new DeleteObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: row.file.objectKey,
      }),
    );
    await db
      .update(exportsTable)
      .set({ status: "expired" })
      .where(eq(exportsTable.id, row.export.id));
    await db
      .update(files)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(files.id, row.file.id));
  }
  return { expired: expired.length };
}

async function numericSetting(key: string, fallback: number) {
  const [row] = await getDb()
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return typeof row?.value === "number" &&
    Number.isFinite(row.value) &&
    row.value > 0
    ? row.value
    : fallback;
}

export async function cleanupRetention() {
  const db = getDb();
  const now = new Date();
  const reminderWindowHours = await numericSetting(
    "invitation_reminder_hours",
    24,
  );
  const removableFileHours = await numericSetting(
    "superseded_file_retention_hours",
    168,
  );
  const expiring = await db
    .select()
    .from(invitations)
    .where(
      and(
        inArray(invitations.status, ["pending", "sent"]),
        gt(invitations.expiresAt, now),
        lte(
          invitations.expiresAt,
          new Date(now.getTime() + reminderWindowHours * 3600000),
        ),
        lt(invitations.sendCount, 2),
      ),
    )
    .limit(100);
  for (const invitation of expiring) {
    await db.transaction(async (tx) => {
      await tx
        .insert(emailOutbox)
        .values({
          templateKey: "invitation_reminder",
          recipientEmail: invitation.emailNormalised,
          recipientProfileId: invitation.profileId,
          applicationId: invitation.applicationId,
          payload: {
            title: "Your GBE Awards invitation is expiring",
            message:
              "Activate your secure portal access before the invitation expires. If you need a new link, contact info@gbeaward.com.",
            expiresAt: invitation.expiresAt.toISOString(),
          },
          idempotencyKey: `invitation_reminder:${invitation.id}:${invitation.sendCount + 1}`,
        })
        .onConflictDoNothing();
      await tx
        .update(invitations)
        .set({ sendCount: invitation.sendCount + 1, updatedAt: now })
        .where(
          and(
            eq(invitations.id, invitation.id),
            eq(invitations.sendCount, invitation.sendCount),
          ),
        );
    });
  }
  const expired = await db
    .update(invitations)
    .set({ status: "expired", tokenHash: null, updatedAt: now })
    .where(
      and(
        inArray(invitations.status, ["pending", "sent"]),
        lte(invitations.expiresAt, now),
      ),
    )
    .returning({
      id: invitations.id,
      applicationId: invitations.applicationId,
    });
  for (const item of expired) {
    const [invitation] = await db
      .select({
        email: invitations.emailNormalised,
        profileId: invitations.profileId,
      })
      .from(invitations)
      .where(eq(invitations.id, item.id))
      .limit(1);
    if (invitation)
      await db
        .insert(emailOutbox)
        .values({
          templateKey: "invitation_expired",
          recipientEmail: invitation.email,
          recipientProfileId: invitation.profileId,
          applicationId: item.applicationId,
          payload: {
            title: "Your GBE Awards invitation expired",
            message:
              "Your secure portal invitation has expired. Contact info@gbeaward.com or ask the GBE Awards team to issue a new link.",
          },
          idempotencyKey: `invitation_expired:${item.id}`,
        })
        .onConflictDoNothing();
    if (item.applicationId)
      await db
        .update(applications)
        .set({ accountAccessStatus: "pending_invite", updatedAt: now })
        .where(
          and(
            eq(applications.id, item.applicationId),
            eq(applications.accountAccessStatus, "invited"),
          ),
        );
  }
  const removedVerifications = await db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id });
  const removedRateLimits = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.resetAt, new Date(now.getTime() - 24 * 3600000)))
    .returning({ key: rateLimitBuckets.key });
  const oldFiles = await db
    .select()
    .from(files)
    .where(
      and(
        inArray(files.status, ["superseded", "rejected"]),
        lt(
          files.updatedAt,
          new Date(now.getTime() - removableFileHours * 3600000),
        ),
      ),
    )
    .limit(100);
  let deletedFiles = 0;
  let deletionFailures = 0;
  for (const file of oldFiles) {
    try {
      await getR2().send(
        new DeleteObjectCommand({
          Bucket:
            file.bucket === "private"
              ? env.R2_PRIVATE_BUCKET
              : env.R2_PUBLIC_BUCKET,
          Key: file.objectKey,
        }),
      );
      await db
        .update(files)
        .set({ status: "deleted", deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(files.id, file.id),
            inArray(files.status, ["superseded", "rejected"]),
          ),
        );
      deletedFiles += 1;
    } catch {
      deletionFailures += 1;
    }
  }
  if (deletionFailures)
    throw new Error(
      `${deletionFailures} retained file object(s) could not be deleted from R2; rows remain retriable.`,
    );
  if (
    expired.length ||
    removedVerifications.length ||
    removedRateLimits.length ||
    deletedFiles
  )
    await db.insert(auditLogs).values({
      actorType: "system",
      action: "retention cleanup completed",
      entityType: "retention_job",
      afterRedacted: {
        expiredInvitations: expired.length,
        removedVerifications: removedVerifications.length,
        removedRateLimits: removedRateLimits.length,
        deletedFiles,
      },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  return {
    remindersQueued: expiring.length,
    expiredInvitations: expired.length,
    removedVerifications: removedVerifications.length,
    removedRateLimits: removedRateLimits.length,
    deletedFiles,
  };
}
