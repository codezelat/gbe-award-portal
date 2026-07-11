import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications, awardCycles } from "@/lib/db/schema";
import { applicantVisibleStatus } from "@/lib/domain/outcome-visibility";
import { requirePortalSession } from "@/server/dal/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { getFeatureFlags } from "@/server/services/feature-flags";

export default async function MyApplications() {
  const { profile } = await requirePortalSession();
  const [flags, rows] = await Promise.all([
    getFeatureFlags(),
    getDb()
      .select({
        application: applications,
        resultsReleaseAt: awardCycles.resultsReleaseAt,
      })
      .from(applications)
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(eq(applications.ownerProfileId, profile.id))
      .orderBy(desc(applications.lastActivityAt)),
  ]);
  return (
    <>
      <h1 className="page-heading">My applications</h1>
      <p className="mt-2 text-graphite">
        Official nominations linked to your approved account.
      </p>
      <div className="mt-7 flex flex-col gap-3">
        {rows.map(({ application, resultsReleaseAt }) => (
          <Link
            key={application.id}
            href={`/portal/applications/${application.id}`}
            className="surface flex flex-wrap items-center justify-between gap-4 rounded-lg p-5 transition-transform hover:-translate-y-px"
          >
            <div>
              <p className="font-mono text-xs text-antique-gold">
                {application.reference}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {application.nomineeName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {application.categoryNameSnapshot}
              </p>
            </div>
            <StatusBadge
              status={applicantVisibleStatus(
                application.workflowStatus,
                resultsReleaseAt,
                new Date(),
                flags.outcome_visibility_enabled,
              )}
            />
          </Link>
        ))}
      </div>
    </>
  );
}
