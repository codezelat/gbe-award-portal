import "server-only";
import { desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { submittedApplications } from "./application-visibility";

const reviewStatuses = ["submitted", "under_review", "resubmitted"] as const;
const countWhere = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

export async function getDashboardApplications(scope?: SQL) {
  const db = getDb();
  const [[counts], recent, unassigned] = await Promise.all([
    db
      .select({
        total: countWhere(
          inArray(applications.workflowStatus, [
            ...reviewStatuses,
            "changes_requested",
            "approved",
            "entry_confirmed",
            "shortlisted",
            "winner",
          ]),
        ),
        review: countWhere(
          inArray(applications.workflowStatus, [...reviewStatuses]),
        ),
        approved: countWhere(eq(applications.workflowStatus, "approved")),
        payments: countWhere(eq(applications.paymentStatus, "proof_submitted")),
        actionRequired: countWhere(
          eq(applications.workflowStatus, "changes_requested"),
        ),
      })
      .from(applications)
      .where(submittedApplications(scope)),
    db
      .select({
        id: applications.id,
        reference: applications.reference,
        nomineeName: applications.nomineeName,
        status: applications.workflowStatus,
        submittedAt: applications.submittedAt,
      })
      .from(applications)
      .where(submittedApplications(scope))
      .orderBy(desc(applications.submittedAt), desc(applications.id))
      .limit(6),
    db
      .select({
        id: applications.id,
        reference: applications.reference,
        nomineeName: applications.nomineeName,
      })
      .from(applications)
      .where(
        submittedApplications(
          scope,
          isNull(applications.assignedReviewerId),
          inArray(applications.workflowStatus, [...reviewStatuses]),
        ),
      )
      .orderBy(desc(applications.submittedAt), desc(applications.id))
      .limit(6),
  ]);
  return { counts, recent, unassigned };
}
