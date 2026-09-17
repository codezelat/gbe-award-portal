"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  applications,
  applicationMessages,
  auditLogs,
  awardCycles,
  emailOutbox,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";
import {
  bulkCommunicationTemplates,
  bulkStatusIssue,
  bulkStatusOptions,
  type BulkActionResult,
} from "@/lib/domain/bulk-applications";
import { outcomeStatuses } from "@/lib/domain/outcome-visibility";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { submittedApplications } from "@/server/dal/application-visibility";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { changeApplicationStatusWithTx } from "@/server/services/application-transition-service";
import { createOrRefreshApplicantInvitation } from "@/server/services/invitation-service";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";

const selectionSchema = z
  .array(z.object({ id: z.uuid(), updatedAt: z.iso.datetime() }))
  .min(1)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    "Select each nomination only once.",
  );
const baseSchema = z.object({
  requestId: z.uuid(),
  selection: selectionSchema,
});
const inputSchema = z.discriminatedUnion("action", [
  baseSchema.extend({
    action: z.literal("status"),
    to: z.enum(bulkStatusOptions.map((option) => option.value)),
    reason: z.string().trim().max(1000),
    applicantMessage: z.string().trim().max(2000),
  }),
  baseSchema.extend({
    action: z.literal("assign"),
    reviewerId: z.uuid().nullable(),
  }),
  baseSchema.extend({
    action: z.literal("message"),
    template: z.enum(["review_update", "deadline_reminder"]),
  }),
]);
class BulkValidationError extends Error {}

export async function updateSelectedApplications(
  input: unknown,
): Promise<BulkActionResult> {
  // Keep session redirects outside the action-result catch.
  const { profile, membership } = await requireStaff();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message:
        "Check your selection and fields, then try again (maximum 100 nominations).",
    };
  const data = parsed.data;
  const permission =
    data.action === "status"
      ? "applications.change_status"
      : data.action === "assign"
        ? "applications.edit"
        : "messages.send";
  const targetPermission =
    data.action === "status"
      ? bulkStatusOptions.find((option) => option.value === data.to)!.permission
      : permission;
  if (
    !hasPermission(membership, permission) ||
    !hasPermission(membership, targetPermission)
  )
    return {
      ok: false,
      message: "You do not have permission for this action.",
    };
  if (
    data.action === "status" &&
    ["rejected", "archived"].includes(data.to) &&
    data.reason.length < 8
  )
    return { ok: false, message: "Add a reason of at least 8 characters." };
  const ids = data.selection.map((row) => row.id).sort();
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        ...data,
        selection: [...data.selection].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest("hex");
  const db = getDb();
  let result: {
    changed: number;
    repeated: boolean;
    approvals: Array<{ id: string; reference: string | null }>;
  };
  try {
    await enforceRateLimit(`application-bulk:${profile.id}`, 30, 3600);
    result = await db.transaction(async (tx) => {
      // Serialize retries of one request, then lock nominations in a stable order.
      // The batch audit's primary key also makes committed requests durable.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${data.requestId}, 0))`,
      );
      const [prior] = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, data.requestId))
        .limit(1);
      if (prior) {
        const metadata = z
          .object({ fingerprint: z.string(), changed: z.number() })
          .safeParse(prior.metadataRedacted);
        if (
          prior.actorProfileId !== profile.id ||
          !metadata.success ||
          metadata.data.fingerprint !== fingerprint
        )
          throw new BulkValidationError(
            "This request changed. Close the dialog and try again.",
          );
        return {
          changed: metadata.data.changed,
          repeated: true,
          approvals: [],
        };
      }
      const rows = await tx
        .select()
        .from(applications)
        .where(submittedApplications(inArray(applications.id, ids)))
        .orderBy(applications.id)
        .for("update");
      if (rows.length !== ids.length)
        throw new BulkValidationError(
          "A selected nomination was removed or is still awaiting submission/payment. Refresh the list and select again. Nothing changed.",
        );
      if (
        !hasPermission(membership, "applications.view_all") &&
        rows.some((row) => row.assignedReviewerId !== profile.id)
      )
        throw new BulkValidationError(
          "A selected nomination is no longer assigned to you. Refresh the list. Nothing changed.",
        );
      const versions = new Map(
        data.selection.map((row) => [row.id, row.updatedAt]),
      );
      if (
        rows.some((row) => row.updatedAt.toISOString() !== versions.get(row.id))
      )
        throw new BulkValidationError(
          "A selected nomination changed since this list loaded. Refresh the list and review it again. Nothing changed.",
        );
      let changed = 0;
      const approvals: Array<{ id: string; reference: string | null }> = [];
      if (data.action === "status") {
        const invalid = rows.find((row) =>
          bulkStatusIssue({ ...row, deleted: false }, data.to),
        );
        if (invalid)
          throw new BulkValidationError(
            `${invalid.reference ?? "A selected nomination"}: ${bulkStatusIssue({ ...invalid, deleted: false }, data.to)} Nothing changed.`,
          );
        if (outcomeStatuses.includes(data.to)) {
          const cycles = await tx
            .select({ release: awardCycles.resultsReleaseAt })
            .from(awardCycles)
            .where(
              inArray(awardCycles.id, [
                ...new Set(rows.map((row) => row.cycleId)),
              ]),
            );
          if (cycles.some((cycle) => !cycle.release))
            throw new BulkValidationError(
              "Set the results release date in Award cycles before recording outcomes. Nothing changed.",
            );
        }
        for (const row of rows) {
          if (row.workflowStatus === data.to) continue;
          await changeApplicationStatusWithTx(tx, {
            applicationId: row.id,
            to: data.to,
            actorProfileId: profile.id,
            reason: data.reason || undefined,
            applicantMessage: data.applicantMessage || undefined,
            requestId: data.requestId,
          });
          changed++;
          if (data.to === "approved")
            approvals.push({ id: row.id, reference: row.reference });
        }
      } else if (data.action === "assign") {
        if (data.reviewerId) {
          const [reviewer] = await tx
            .select({ id: profiles.id })
            .from(profiles)
            .innerJoin(
              staffMemberships,
              eq(staffMemberships.profileId, profiles.id),
            )
            .where(
              and(
                eq(profiles.id, data.reviewerId),
                eq(profiles.accountKind, "staff"),
                eq(profiles.isActive, true),
                isNull(staffMemberships.suspendedAt),
              ),
            )
            .limit(1);
          if (!reviewer)
            throw new BulkValidationError(
              "Choose an active staff member. Nothing changed.",
            );
        }
        const changedIds = rows
          .filter((row) => row.assignedReviewerId !== data.reviewerId)
          .map((row) => row.id);
        if (changedIds.length)
          await tx
            .update(applications)
            .set({
              assignedReviewerId: data.reviewerId,
              lastActivityAt: new Date(),
              updatedAt: new Date(),
            })
            .where(inArray(applications.id, changedIds));
        changed = changedIds.length;
      } else {
        if (
          data.template === "deadline_reminder" &&
          rows.some((row) => row.accountAccessStatus !== "active")
        )
          throw new BulkValidationError(
            "A portal reminder needs active portal access for every selected nomination. Nothing was sent.",
          );
        const template = bulkCommunicationTemplates[data.template];
        for (const row of rows) {
          await tx
            .insert(applicationMessages)
            .values({
              applicationId: row.id,
              senderProfileId: profile.id,
              senderType: "staff",
              visibility: "applicant",
              subject: template.subject,
              body: template.body,
            });
          await tx
            .insert(emailOutbox)
            .values({
              templateKey: data.template,
              recipientEmail: row.emailNormalised,
              recipientProfileId: row.ownerProfileId,
              applicationId: row.id,
              payload: {
                title: template.subject,
                message: template.body,
                reference: row.reference,
                url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/messages`,
              },
              idempotencyKey: `bulk_message:${data.requestId}:${row.id}`,
            });
        }
        changed = rows.length;
      }
      await tx
        .insert(auditLogs)
        .values({
          id: data.requestId,
          actorProfileId: profile.id,
          actorType: "staff",
          action: `applications bulk ${data.action}`,
          entityType: "application_batch",
          entityId: data.requestId,
          afterRedacted: {
            action: data.action,
            count: changed,
            ...(data.action === "status"
              ? { to: data.to }
              : data.action === "assign"
                ? { reviewerId: data.reviewerId }
                : { template: data.template }),
          },
          reason: data.action === "status" ? data.reason : undefined,
          metadataRedacted: { applicationIds: ids, fingerprint, changed },
          requestId: data.requestId,
        });
      return { changed, repeated: false, approvals };
    });
  } catch (error) {
    if (error instanceof BulkValidationError)
      return { ok: false, message: error.message };
    if (
      error instanceof Error &&
      error.message === "Too many attempts. Please wait before trying again."
    )
      return { ok: false, message: error.message };
    // Do not expose database/provider errors or claim a network timeout rolled back.
    return {
      ok: false,
      message:
        "Could not confirm the update. Retry this action to safely check its result, or refresh the list.",
    };
  }
  const warnings: Array<{ id: string; reference: string | null }> = [];
  // Auth account creation happens after the atomic status transaction. A failure
  // must not misreport successfully approved nominations as an unsuccessful batch.
  for (const row of result.approvals) {
    try {
      await createOrRefreshApplicantInvitation(row.id, profile.id);
    } catch {
      warnings.push(row);
    }
  }
  if (result.repeated && data.action === "status" && data.to === "approved") {
    const rows = await db
      .select({
        id: applications.id,
        reference: applications.reference,
        access: applications.accountAccessStatus,
      })
      .from(applications)
      .where(submittedApplications(inArray(applications.id, ids)));
    warnings.push(
      ...rows.filter((row) => !["active", "invited"].includes(row.access)),
    );
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  if (data.action !== "assign") scheduleEmailOutboxProcessing();
  const verb = data.action === "message" ? "queued for messaging" : "updated";
  return {
    ok: true,
    message: result.repeated
      ? "This update was already applied. No duplicate changes were made."
      : `${result.changed} nomination${result.changed === 1 ? "" : "s"} ${verb}.${data.action === "status" && result.changed < ids.length ? ` ${ids.length - result.changed} already had this status.` : ""}`,
    warnings,
  };
}
