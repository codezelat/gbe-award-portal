import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  applications,
  applicationStatusHistory,
  awardCycles,
  auditLogs,
  emailOutbox,
} from "@/lib/db/schema";
import { outcomeStatuses } from "@/lib/domain/outcome-visibility";

import {
  canTransition,
  type WorkflowStatus,
} from "@/lib/domain/application-status";
const applicantLabels: Record<WorkflowStatus, string> = {
  uploading: "Upload in progress",
  submitted: "Nomination received",
  under_review: "Under review",
  changes_requested: "Action required",
  resubmitted: "Updates received",
  approved: "Nomination approved",
  entry_confirmed: "Entry confirmed",
  shortlisted: "Shortlisted",
  winner: "Award winner",
  not_selected: "Outcome available",
  rejected: "Nomination not approved",
  withdrawn: "Withdrawn",
  archived: "Archived",
};
export async function changeApplicationStatus(input: {
  applicationId: string;
  to: WorkflowStatus;
  actorProfileId: string;
  reason?: string;
  applicantMessage?: string;
  requestId: string;
}) {
  await getDb().transaction(async (tx) =>
    changeApplicationStatusWithTx(tx, input),
  );
}

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export async function changeApplicationStatusWithTx(
  tx: DatabaseTransaction,
  input: {
    applicationId: string;
    to: WorkflowStatus;
    actorProfileId: string;
    reason?: string;
    applicantMessage?: string;
    requestId: string;
  },
) {
  const [current] = await tx
    .select({
      status: applications.workflowStatus,
      email: applications.emailNormalised,
      reference: applications.reference,
      resultsReleaseAt: awardCycles.resultsReleaseAt,
    })
    .from(applications)
    .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!current) throw new Error("Application not found.");
  if (current.status === input.to) return;
  if (!canTransition(current.status, input.to))
    throw new Error(
      `The application cannot move from ${current.status} to ${input.to}.`,
    );
  const now = new Date();
  const isOutcome = outcomeStatuses.includes(input.to);
  let nextAttemptAt = now;
  if (isOutcome) {
    if (!current.resultsReleaseAt)
      throw new Error(
        "Configure a results release date for this award cycle before recording outcomes.",
      );
    nextAttemptAt = current.resultsReleaseAt;
  }
  if (
    ["rejected", "archived"].includes(input.to) &&
    (!input.reason || input.reason.trim().length < 8)
  )
    throw new Error("A meaningful reason is required.");
  const updated = await tx
    .update(applications)
    .set({
      workflowStatus: input.to,
      lastActivityAt: now,
      updatedAt: now,
      approvedAt: input.to === "approved" ? now : undefined,
    })
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.workflowStatus, current.status),
      ),
    )
    .returning({ id: applications.id });
  if (!updated.length)
    throw new Error(
      "The application changed while you were reviewing it. Refresh and try again.",
    );
  await tx.insert(applicationStatusHistory).values({
    applicationId: input.applicationId,
    fromStatus: current.status,
    toStatus: input.to,
    applicantLabel: applicantLabels[input.to],
    applicantMessage: input.applicantMessage,
    internalReason: input.reason,
    changedByProfileId: input.actorProfileId,
  });
  await tx.insert(auditLogs).values({
    actorProfileId: input.actorProfileId,
    actorType: "staff",
    action: "application status changed",
    entityType: "application",
    entityId: input.applicationId,
    applicationId: input.applicationId,
    beforeRedacted: { status: current.status },
    afterRedacted: { status: input.to },
    reason: input.reason,
    requestId: input.requestId,
  });
  await tx.insert(emailOutbox).values({
    templateKey: `application_${input.to}`,
    recipientEmail: current.email,
    applicationId: input.applicationId,
    payload: {
      reference: current.reference,
      status: applicantLabels[input.to],
      message: input.applicantMessage,
    },
    idempotencyKey: `application_status:${input.applicationId}:${input.to}:${now.toISOString()}`,
    nextAttemptAt,
  });
}
