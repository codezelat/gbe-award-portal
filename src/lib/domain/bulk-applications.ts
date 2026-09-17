import { canTransition, type WorkflowStatus } from "./application-status";

// Corrections need field-level access; resubmission belongs to the applicant.
export const bulkStatusOptions = [
  {
    value: "under_review",
    label: "Under review",
    permission: "applications.change_status",
  },
  {
    value: "approved",
    label: "Nomination approved",
    permission: "applications.approve",
  },
  {
    value: "rejected",
    label: "Not approved",
    permission: "applications.reject",
  },
  {
    value: "entry_confirmed",
    label: "Entry confirmed",
    permission: "applications.change_status",
  },
  {
    value: "shortlisted",
    label: "Shortlisted",
    permission: "applications.release_outcome",
  },
  {
    value: "winner",
    label: "Award winner",
    permission: "applications.release_outcome",
  },
  {
    value: "not_selected",
    label: "Not selected",
    permission: "applications.release_outcome",
  },
  {
    value: "withdrawn",
    label: "Withdrawn",
    permission: "applications.change_status",
  },
  { value: "archived", label: "Archived", permission: "applications.edit" },
] as const satisfies ReadonlyArray<{
  value: WorkflowStatus;
  label: string;
  permission: string;
}>;

export type BulkStatus = (typeof bulkStatusOptions)[number]["value"];
export type BulkPermissions = {
  status: BulkStatus[];
  assign: boolean;
  message: boolean;
  export: boolean;
};
export type BulkSelection = {
  id: string;
  reference: string | null;
  nomineeName: string;
  workflowStatus: WorkflowStatus;
  paymentStatus: string;
  updatedAt: string;
  deleted: boolean;
};

export function bulkStatusIssue(
  row: Pick<BulkSelection, "workflowStatus" | "paymentStatus" | "deleted">,
  to: BulkStatus,
): string | null {
  if (row.deleted) return "Restore this nomination first.";
  if (row.workflowStatus === to) return null;
  if (!canTransition(row.workflowStatus, to))
    return "This status change is not available from its current status.";
  if (
    to === "entry_confirmed" &&
    !["verified", "waived", "not_required"].includes(row.paymentStatus)
  )
    return "Verify the payment first.";
  return null;
}

export const bulkCommunicationTemplates = {
  review_update: {
    label: "Review update",
    subject: "Your GBE Awards nomination is being reviewed",
    body: "The GBE Awards team is continuing its review of your nomination. No action is required unless we contact you separately.",
  },
  deadline_reminder: {
    label: "Deadline reminder",
    subject: "Reminder: check your GBE Awards portal",
    body: "Please sign in to your GBE Awards portal to review any current action or document request before its stated deadline.",
  },
} as const;

export type BulkActionResult =
  | { ok: false; message: string }
  | {
      ok: true;
      message: string;
      warnings: Array<{ id: string; reference: string | null }>;
    };
