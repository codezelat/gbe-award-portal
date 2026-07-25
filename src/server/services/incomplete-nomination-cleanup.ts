import "server-only";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  applicationChangeRequests,
  applicationFieldAccess,
  applicationFiles,
  applicationMessages,
  applicationNotes,
  applicationStatusHistory,
  applicationVersions,
  applications,
  auditLogs,
  awardCycles,
  emailOutbox,
  invitations,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { canPurgeIncompletePaymentShell } from "@/lib/domain/payment-verification";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";

const manifestSchema = z.array(
  z.object({
    id: z.uuid(),
    kind: z.enum(["supporting_document", "payment_proof"]),
  }),
);

type CleanupActor = {
  profileId?: string;
  type: "staff" | "system";
  reason: string;
};

export async function purgeIncompleteNominationShell(
  applicationId: string,
  actor: CleanupActor,
  { deleteStagedObjects = true }: { deleteStagedObjects?: boolean } = {},
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        application: applications,
        payment: payments,
        cycleYear: awardCycles.year,
      })
      .from(applications)
      .innerJoin(payments, eq(payments.applicationId, applications.id))
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!record)
      throw new Error("The incomplete nomination is no longer available.");
    if (
      !canPurgeIncompletePaymentShell({
        workflowStatus: record.application.workflowStatus,
        applicationReference: record.application.reference,
        applicationSubmittedAt: record.application.submittedAt,
        paymentReference: record.payment.paymentReference,
        proofApplicationFileId: record.payment.proofApplicationFileId,
        payerName: record.payment.payerName,
        bankReference: record.payment.bankReference,
        amountMinor: record.payment.amountMinor,
        currency: record.payment.currency,
        paidAt: record.payment.paidAt,
      })
    )
      throw new Error(
        "Only an unfinished nomination with no payment evidence can be removed.",
      );

    const [[linkedFileCount], sessions] = await Promise.all([
      tx
        .select({ value: count() })
        .from(applicationFiles)
        .where(eq(applicationFiles.applicationId, applicationId)),
      tx
        .select({ expectedManifest: uploadSessions.expectedManifest })
        .from(uploadSessions)
        .where(eq(uploadSessions.applicationId, applicationId)),
    ]);
    if (linkedFileCount.value > 0)
      throw new Error(
        "This nomination has retained files and cannot be removed automatically.",
      );

    if (deleteStagedObjects) {
      const stagedKeys = new Set<string>();
      for (const session of sessions) {
        const manifest = manifestSchema.safeParse(session.expectedManifest);
        if (!manifest.success)
          throw new Error("The staged upload manifest is invalid.");
        for (const item of manifest.data)
          stagedKeys.add(
            r2ObjectKey(
              `${item.kind === "payment_proof" ? "payment-proofs" : "applications"}/${record.cycleYear}/${applicationId}/${item.id}`,
            ),
          );
      }
      for (const key of stagedKeys)
        await getR2().send(
          new DeleteObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET, Key: key }),
        );
    }

    await tx
      .delete(applicationFieldAccess)
      .where(eq(applicationFieldAccess.applicationId, applicationId));
    await tx
      .delete(applicationChangeRequests)
      .where(eq(applicationChangeRequests.applicationId, applicationId));
    await tx
      .delete(applicationMessages)
      .where(eq(applicationMessages.applicationId, applicationId));
    await tx
      .delete(applicationNotes)
      .where(eq(applicationNotes.applicationId, applicationId));
    await tx
      .delete(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, applicationId));
    await tx
      .delete(applicationVersions)
      .where(eq(applicationVersions.applicationId, applicationId));
    await tx
      .delete(invitations)
      .where(eq(invitations.applicationId, applicationId));
    await tx
      .delete(emailOutbox)
      .where(eq(emailOutbox.applicationId, applicationId));
    await tx
      .delete(uploadSessions)
      .where(eq(uploadSessions.applicationId, applicationId));
    await tx.delete(payments).where(eq(payments.applicationId, applicationId));

    const now = new Date();
    const removed = await tx
      .update(applications)
      .set({
        deletedAt: now,
        deletedBy: actor.profileId ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.workflowStatus, "uploading"),
          isNull(applications.deletedAt),
        ),
      )
      .returning({ id: applications.id });
    if (!removed.length)
      throw new Error("The incomplete nomination changed. Refresh and try again.");

    await tx.insert(auditLogs).values({
      actorProfileId: actor.profileId,
      actorType: actor.type,
      action: "incomplete nomination shell purged",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      beforeRedacted: { workflowStatus: "uploading" },
      afterRedacted: { deleted: true, paymentRecordRemoved: true },
      reason: actor.reason,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
}
