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
  paymentAttempts,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { draftFileRows } from "@/server/services/nomination-drafts";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { purgeIncompleteNominationShell } from "@/server/services/incomplete-nomination-cleanup";

export async function deleteInProgress(input: { id: string; source: string }) {
  try {
    const parsed = z
      .object({ id: z.uuid(), source: z.enum(["draft", "upload"]) })
      .parse(input);
    const { profile, membership } = await requireStaff();
    if (
      !hasPermission(membership, "applications.view_all") ||
      !hasPermission(membership, "applications.edit")
    )
      throw new Error("Draft management permission is required.");
    await enforceRateLimit(`delete-draft:${profile.id}`, 30, 3600);
    if (parsed.source === "upload") {
      if (membership.role !== "super_admin")
        throw new Error(
          "A super administrator must remove this legacy upload.",
        );
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
    revalidatePath("/admin", "layout");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error && !("cause" in error)
          ? error.message
          : "Could not delete this draft. Please retry.",
    };
  }
}
