import { and, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import { applications } from "@/lib/db/schema";

// Ordinary workspaces exclude soft-deleted nominations. Archive/audit views
// deliberately use their own explicit scope so retained history stays available.
export function nonDeletedApplications(...conditions: Array<SQL | undefined>) {
  return and(isNull(applications.deletedAt), ...conditions)!;
}

export function submittedApplications(...conditions: Array<SQL | undefined>) {
  return nonDeletedApplications(
    isNotNull(applications.submittedAt),
    ne(applications.workflowStatus, "uploading"),
    ...conditions,
  );
}
