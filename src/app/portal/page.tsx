import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { getDb } from "@/lib/db";
import {
  applications,
  applicationStatusHistory,
  awardCycles,
} from "@/lib/db/schema";
import {
  applicantVisibleStatus,
  isOutcomeReleased,
  outcomeStatuses,
} from "@/lib/domain/outcome-visibility";
import { requirePortalSession } from "@/server/dal/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";
import { getFeatureFlags } from "@/server/services/feature-flags";
export default async function PortalDashboard() {
  const { profile } = await requirePortalSession();
  const database = getDb();
  const [flags, [row]] = await Promise.all([
    getFeatureFlags(),
    database
      .select({
        application: applications,
        resultsReleaseAt: awardCycles.resultsReleaseAt,
      })
      .from(applications)
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(eq(applications.ownerProfileId, profile.id))
      .orderBy(desc(applications.lastActivityAt))
      .limit(1),
  ]);
  if (!row)
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="page-heading">Your approved workspace</h1>
        <p className="mt-4 text-graphite">
          No approved application is linked to this account yet. Please contact
          info@gbeaward.com so the team can verify the account link.
        </p>
        <Button className="mt-7" render={<a href="mailto:info@gbeaward.com" />}>
          <Mail data-icon="inline-start" />
          Contact support
        </Button>
      </div>
    );
  const { application, resultsReleaseAt } = row;
  const outcomeReleased =
    flags.outcome_visibility_enabled && isOutcomeReleased(resultsReleaseAt);
  const visibleStatus = applicantVisibleStatus(
    application.workflowStatus,
    resultsReleaseAt,
    new Date(),
    flags.outcome_visibility_enabled,
  );
  const journey = (
    await database
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, application.id))
      .orderBy(asc(applicationStatusHistory.effectiveAt))
  ).filter(
    (item) => outcomeReleased || !outcomeStatuses.includes(item.toStatus),
  );
  const timeline = journey.length
    ? journey
    : [
        {
          id: `current-${application.id}`,
          applicantLabel: visibleStatus.replaceAll("_", " "),
          applicantMessage: null,
          effectiveAt: application.submittedAt ?? application.createdAt,
        },
      ];
  const actionRequired =
    application.workflowStatus === "changes_requested" ||
    application.paymentStatus === "rejected";
  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-heading">
            Good day, {profile.displayName.split(" ")[0]}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Application reference{" "}
            <span className="ml-1 font-mono font-semibold text-foreground">
              {application.reference}
            </span>
          </p>
        </div>
        <p className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <ShieldCheck />
          Private and secure
        </p>
      </div>
      <section
        className={`glass-feature rounded-xl p-6 md:p-9 ${actionRequired ? "border-[#ebcfc5]" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <StatusBadge status={visibleStatus} />
            <h2 className="mt-4 font-display text-3xl font-semibold md:text-4xl">
              {actionRequired
                ? "Your application needs an update"
                : "Your nomination journey is progressing"}
            </h2>
            <p className="mt-3 leading-7 text-graphite">
              {actionRequired
                ? "The GBE Awards team has requested information or a replacement payment proof. Review the request before the stated deadline."
                : "The GBE Awards team will show each official update here. You do not need to contact us unless an action appears."}
            </p>
          </div>
          <Button
            className={actionRequired ? "ceremonial-button h-12" : "h-12"}
            render={<Link href={`/portal/applications/${application.id}`} />}
          >
            {actionRequired ? "Review requested updates" : "View application"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
        <div className="mt-7 grid gap-4 border-t pt-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Payment
            </p>
            <div className="mt-2">
              <StatusBadge status={application.paymentStatus} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Latest activity
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <CalendarDays />
              {formatInTimeZone(
                application.lastActivityAt,
                "Asia/Colombo",
                "dd MMMM yyyy, HH:mm",
              )}
            </p>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <section className="surface rounded-lg p-6">
          <h2 className="section-title">Your application journey</h2>
          <ol className="mt-6 flex flex-col">
            {timeline.map((item, index) => {
              const current = index === timeline.length - 1;
              return (
                <li
                  key={item.id}
                  className="grid grid-cols-[32px_1fr] gap-3 pb-6 last:pb-0"
                >
                  <div
                    className={`grid size-8 place-items-center rounded-full border ${current ? "border-[#94452d] bg-[#f9ece7] text-[#94452d]" : "border-champagne bg-champagne text-white"}`}
                  >
                    {current ? <Circle /> : <Check />}
                  </div>
                  <div className="border-b pb-5 last:border-0">
                    <p className="font-medium">{item.applicantLabel}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.applicantMessage ??
                        (current
                          ? "Current stage"
                          : formatInTimeZone(
                              item.effectiveAt,
                              "Asia/Colombo",
                              "dd MMM yyyy, HH:mm",
                            ))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="flex flex-col gap-6">
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Need help?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Our awards concierge team is here to assist you.
            </p>
            <a
              href="mailto:info@gbeaward.com"
              className="mt-4 inline-flex items-center gap-2 text-sm text-antique-gold underline"
            >
              <Mail />
              info@gbeaward.com
            </a>
          </section>
        </div>
      </div>
    </>
  );
}
