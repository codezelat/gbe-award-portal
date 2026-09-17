import {
  and,
  isNotNull,
  isNull,
  ne,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { applications, payments } from "@/lib/db/schema";

// Card checkout saves a recovery record before the gateway settles. Keep that
// record, but do not count it as a received nomination until payment completes.
// verifiedAt preserves already-settled history even after a refund/reversal.
export function pendingCardPayment() {
  // Keep the outer ID qualified even when Drizzle renders a single-table SELECT
  // projection; otherwise the subquery can resolve "id" to the payment itself.
  return sql<boolean>`exists (select 1 from ${payments}
    where ${payments.applicationId} = ${sql.identifier("applications")}.${sql.identifier("id")}
      and (${payments.method} = 'card' or
        (${payments.expectedAmountMinor} is not null and ${payments.proofApplicationFileId} is null))
      and ${payments.status} in ('awaiting_payment', 'under_review', 'rejected')
      and ${payments.verifiedAt} is null
      and ${payments.gatewayTransactionId} is null)`;
}

export function completedSubmission(...conditions: Array<SQL | undefined>) {
  return and(
    isNotNull(applications.submittedAt),
    ne(applications.workflowStatus, "uploading"),
    not(pendingCardPayment()),
    ...conditions,
  )!;
}

// Ordinary workspaces exclude soft-deleted nominations. Archive/audit views
// deliberately use their own explicit scope so retained history stays available.
export function nonDeletedApplications(...conditions: Array<SQL | undefined>) {
  return and(isNull(applications.deletedAt), ...conditions)!;
}

export function submittedApplications(...conditions: Array<SQL | undefined>) {
  return nonDeletedApplications(completedSubmission(), ...conditions);
}

// Explicit Deleted views must still allow recovery of a removed checkout.
// Callers also apply their selected active/include/only deletion filter.
export function administrativeSubmissions() {
  return or(
    completedSubmission(),
    and(
      isNotNull(applications.deletedAt),
      isNotNull(applications.submittedAt),
      ne(applications.workflowStatus, "uploading"),
    ),
  )!;
}
