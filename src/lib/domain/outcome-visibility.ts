import type { WorkflowStatus } from "@/lib/domain/application-status";

export const outcomeStatuses: WorkflowStatus[] = [
  "shortlisted",
  "winner",
  "not_selected",
];

export function isOutcomeReleased(
  resultsReleaseAt: Date | null,
  now = new Date(),
) {
  return (
    resultsReleaseAt !== null && resultsReleaseAt.getTime() <= now.getTime()
  );
}

export function applicantVisibleStatus(
  status: WorkflowStatus,
  resultsReleaseAt: Date | null,
  now = new Date(),
  visibilityEnabled = true,
): WorkflowStatus {
  return outcomeStatuses.includes(status) &&
    (!visibilityEnabled || !isOutcomeReleased(resultsReleaseAt, now))
    ? "entry_confirmed"
    : status;
}
