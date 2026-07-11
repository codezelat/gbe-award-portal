import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Eye, LockKeyhole } from "lucide-react";
import { getDb } from "@/lib/db";
import { applications, payments, profiles, user } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { applicantVisibleStatus } from "@/lib/domain/outcome-visibility";
import { awardCycles } from "@/lib/db/schema";
import { getFeatureFlags } from "@/server/services/feature-flags";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

export default async function ApplicantExperience({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "applicants.manage")) notFound();
  const db = getDb();
  const [[applicant], flags] = await Promise.all([
    db
      .select({ profile: profiles, email: user.email })
      .from(profiles)
      .innerJoin(user, eq(profiles.authUserId, user.id))
      .where(
        and(eq(profiles.id, profileId), eq(profiles.accountKind, "applicant")),
      )
      .limit(1),
    getFeatureFlags(),
  ]);
  if (!applicant) notFound();
  const rows = await db
    .select({
      application: applications,
      payment: payments,
      resultsReleaseAt: awardCycles.resultsReleaseAt,
    })
    .from(applications)
    .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
    .leftJoin(payments, eq(payments.applicationId, applications.id))
    .where(eq(applications.ownerProfileId, profileId))
    .orderBy(desc(applications.lastActivityAt));
  return (
    <>
      <section className="rounded-lg border border-antique-gold bg-gold-wash p-5">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 text-antique-gold" />
          <div>
            <h1 className="text-lg font-semibold">
              Read-only applicant experience
            </h1>
            <p className="mt-1 text-sm leading-6 text-graphite">
              This is an authorised staff preview of what{" "}
              {applicant.profile.displayName}
              can see. It does not impersonate the applicant and exposes no
              mutation controls.
            </p>
          </div>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{applicant.email}</p>
          <h2 className="page-heading mt-1">
            {applicant.profile.displayName}&apos;s applications
          </h2>
        </div>
        <Button
          variant="outline"
          render={<Link href={`/admin/applicants/${profileId}`} />}
        >
          Return to account management
        </Button>
      </div>
      <div className="mt-7 flex flex-col gap-4">
        {rows.length ? (
          rows.map(({ application, payment, resultsReleaseAt }) => (
            <article key={application.id} className="surface rounded-lg p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-antique-gold">
                    {application.reference}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">
                    {application.nomineeName}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {application.categoryNameSnapshot}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    status={applicantVisibleStatus(
                      application.workflowStatus,
                      resultsReleaseAt,
                      new Date(),
                      flags.outcome_visibility_enabled,
                    )}
                  />
                  {payment ? <StatusBadge status={payment.status} /> : null}
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
                <LockKeyhole /> Official nomination data is locked unless a
                selected-field request is active.
              </div>
            </article>
          ))
        ) : (
          <p className="surface rounded-lg p-10 text-center text-muted-foreground">
            No approved application is currently linked to this account.
          </p>
        )}
      </div>
    </>
  );
}
