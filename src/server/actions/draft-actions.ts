"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  auditLogs,
  files,
  nominationDrafts,
  specialInvites,
  paymentAttempts,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { draftFileRows } from "@/server/services/nomination-drafts";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { purgeIncompleteNominationShell } from "@/server/services/incomplete-nomination-cleanup";
import { removeUnpaidCheckout } from "@/server/services/in-progress-checkouts";

const recordSchema = z.object({
  id: z.uuid(),
  source: z.enum(["draft", "upload", "card"]),
});
type RecordInput = z.infer<typeof recordSchema>;
type Staff = Awaited<ReturnType<typeof requireStaff>>;

async function authorize() {
  const staff = await requireStaff();
  const { profile, membership } = staff;
  if (
    !hasPermission(membership, "applications.view_all") ||
    !hasPermission(membership, "applications.edit")
  )
    throw new Error("Draft management permission is required.");
  await enforceRateLimit(`delete-draft:${profile.id}`, 30, 3600);
  return staff;
}

async function remove(parsed: RecordInput, { profile, membership }: Staff) {
  if (parsed.source === "card") {
    await removeUnpaidCheckout(parsed.id, profile.id);
  } else if (parsed.source === "upload") {
    if (membership.role !== "super_admin")
      throw new Error("A super administrator must remove this legacy upload.");
    const [existing] = await getDb()
      .select({ deletedAt: applications.deletedAt })
      .from(applications)
      .where(eq(applications.id, parsed.id));
    if (existing?.deletedAt) return;
    await purgeIncompleteNominationShell(parsed.id, {
      profileId: profile.id,
      type: "staff",
      reason: "Unsubmitted nomination removed from In-progress.",
    });
  } else
    await getDb().transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(nominationDrafts)
        .where(eq(nominationDrafts.id, parsed.id))
        .for("update");
      if (!draft || draft.deletedAt) return;
      if (draft.submittedAt)
        throw new Error(
          "This nomination was submitted. It cannot be deleted as a draft.",
        );
      const now = new Date();
      if (draft.applicationId) {
        const [app] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, draft.applicationId))
          .for("update");
        const [evidence] = await tx
          .select({ id: applicationFiles.id })
          .from(applicationFiles)
          .where(eq(applicationFiles.applicationId, draft.applicationId))
          .limit(1);
        const [attempt] = await tx
          .select({ id: paymentAttempts.id })
          .from(paymentAttempts)
          .innerJoin(payments, eq(payments.id, paymentAttempts.paymentId))
          .where(eq(payments.applicationId, draft.applicationId))
          .limit(1);
        if (
          !app ||
          app.reference ||
          app.submittedAt ||
          app.workflowStatus !== "uploading" ||
          evidence ||
          attempt
        )
          throw new Error(
            "This nomination has submitted or payment records and must be retained.",
          );
        await tx
          .update(applications)
          .set({ deletedAt: now, deletedBy: profile.id, updatedAt: now })
          .where(eq(applications.id, app.id));
        await tx
          .update(uploadSessions)
          .set({ status: "failed", updatedAt: now })
          .where(
            and(
              eq(uploadSessions.applicationId, app.id),
              eq(uploadSessions.status, "uploading"),
            ),
          );
      }
      const linked = await draftFileRows(draft.id, tx);
      // Durable cleanup queue: retention removes these private objects after signed uploads expire.
      if (linked.length)
        await tx
          .update(files)
          .set({ status: "superseded", updatedAt: now })
          .where(
            inArray(
              files.id,
              linked.map((row) => row.file.id),
            ),
          );
      await tx
        .update(nominationDrafts)
        .set({ deletedAt: now, payload: {}, updatedAt: now })
        .where(
          and(
            eq(nominationDrafts.id, draft.id),
            isNull(nominationDrafts.submittedAt),
          ),
        );
      await tx
        .update(specialInvites)
        .set({ revokedAt: now })
        .where(
          and(
            eq(specialInvites.draftId, draft.id),
            isNull(specialInvites.consumedAt),
            isNull(specialInvites.revokedAt),
          ),
        );
      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorProfileId: profile.id,
        action: "nomination draft deleted",
        entityType: "nomination_draft",
        entityId: draft.id,
        metadataRedacted: { fileCount: linked.length },
        requestId: crypto.randomUUID(),
      });
    });
}

function refreshLists() {
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
}

function failureMessage(error: unknown) {
  return error instanceof Error &&
    !("cause" in error) &&
    !(error instanceof z.ZodError)
    ? error.message
    : "Could not delete this record. Please retry.";
}

export async function deleteInProgress(input: { id: string; source: string }) {
  try {
    const parsed = recordSchema.parse(input);
    await remove(parsed, await authorize());
    refreshLists();
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message: failureMessage(error),
    };
  }
}

export async function deleteInProgressBatch(
  input: { id: string; source: string }[],
) {
  try {
    const records = z
      .array(recordSchema)
      .min(1)
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length)
      .parse(input);
    const staff = await authorize();
    if (
      records.some((row) => row.source === "upload") &&
      staff.membership.role !== "super_admin"
    )
      throw new Error("A super administrator must remove legacy uploads.");
    const deleted: RecordInput[] = [];
    const failed: (RecordInput & { message: string })[] = [];
    // Each record is independently protected against simultaneous submission/settlement.
    // Report partial results explicitly, so a stale row does not hide successful deletions.
    for (const record of records) {
      try {
        await remove(record, staff);
        deleted.push(record);
      } catch (error) {
        failed.push({ ...record, message: failureMessage(error) });
      }
    }
    refreshLists();
    return { ok: true as const, deleted, failed };
  } catch (error) {
    return { ok: false as const, message: failureMessage(error) };
  }
}
