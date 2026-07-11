import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  applicationChangeRequests,
  applications,
  awardCycles,
} from "@/lib/db/schema";
import { applicantVisibleStatus } from "@/lib/domain/outcome-visibility";
import { requirePortalSession } from "@/server/dal/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { submitRequestedChangesAction } from "@/server/actions/applicant-actions";
import { getFeatureFlags } from "@/server/services/feature-flags";
export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { profile } = await requirePortalSession();
  const flags = await getFeatureFlags();
  const [row] = await getDb()
    .select({
      application: applications,
      resultsReleaseAt: awardCycles.resultsReleaseAt,
    })
    .from(applications)
    .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.ownerProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const app = row.application;
  const visibleStatus = applicantVisibleStatus(
    app.workflowStatus,
    row.resultsReleaseAt,
    new Date(),
    flags.outcome_visibility_enabled,
  );
  const [changeRequest] = await getDb()
    .select()
    .from(applicationChangeRequests)
    .where(
      and(
        eq(applicationChangeRequests.applicationId, app.id),
        eq(applicationChangeRequests.status, "open"),
      ),
    )
    .limit(1);
  const fields = [
    ["Official name / organisation", app.nomineeName],
    ["Designation", app.designation || "Not provided"],
    ["Industry / business sector", app.industrySector],
    ["Business website", app.businessWebsite || "Not provided"],
    ["Primary email", app.emailDisplay],
    ["Telephone", app.phoneDisplay],
    ["Award category", app.categoryNameSnapshot],
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-antique-gold">{app.reference}</p>
          <h1 className="page-heading mt-1">Your nomination</h1>
        </div>
        <StatusBadge status={visibleStatus} />
      </div>
      {changeRequest ? (
        <section className="glass-feature mt-7 rounded-xl border-[#ebcfc5] p-6 md:p-8">
          <StatusBadge status="changes_requested" />
          <h2 className="mt-4 font-display text-3xl font-semibold">
            Requested updates
          </h2>
          <p className="mt-3 max-w-2xl whitespace-pre-wrap leading-7 text-graphite">
            {changeRequest.instructions}
          </p>
          {changeRequest.dueAt ? (
            <p className="mt-3 text-sm font-medium text-[#94452d]">
              Please respond by{" "}
              {changeRequest.dueAt.toLocaleDateString("en-GB")}
            </p>
          ) : null}
          <form
            action={submitRequestedChangesAction}
            className="mt-7 grid gap-5 md:grid-cols-2"
          >
            <input type="hidden" name="applicationId" value={app.id} />
            <input type="hidden" name="requestId" value={changeRequest.id} />
            {changeRequest.fieldKeys.includes("nomineeName") ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Nominee / organisation name
                <Input
                  name="nomineeName"
                  defaultValue={app.nomineeName}
                  required
                  className="h-[50px] bg-white"
                />
              </label>
            ) : null}
            {changeRequest.fieldKeys.includes("designation") ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Designation
                <Input
                  name="designation"
                  defaultValue={app.designation ?? ""}
                  className="h-[50px] bg-white"
                />
              </label>
            ) : null}
            {changeRequest.fieldKeys.includes("industrySector") ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Industry / sector
                <Input
                  name="industrySector"
                  defaultValue={app.industrySector}
                  required
                  className="h-[50px] bg-white"
                />
              </label>
            ) : null}
            {changeRequest.fieldKeys.includes("businessWebsite") ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Business website
                <Input
                  name="businessWebsite"
                  type="url"
                  defaultValue={app.businessWebsite ?? ""}
                  className="h-[50px] bg-white"
                />
              </label>
            ) : null}
            {changeRequest.fieldKeys.includes("phoneDisplay") ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Telephone
                <Input
                  name="phoneDisplay"
                  type="tel"
                  defaultValue={app.phoneDisplay}
                  required
                  className="h-[50px] bg-white"
                />
              </label>
            ) : null}
            <div className="md:col-span-2">
              {changeRequest.requestedFileKinds.length ? (
                <p className="mb-4 text-sm text-muted-foreground">
                  A requested document upload is also required. Upload it from
                  the Documents area before submitting these updates.
                </p>
              ) : null}
              <Button type="submit" className="h-12">
                Submit updates
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      <section className="surface mt-7 rounded-lg p-6 md:p-8">
        <div className="mb-6 flex items-start gap-3 rounded-md bg-muted p-4 text-sm text-graphite">
          <LockKeyhole className="mt-0.5 shrink-0" />
          <p>
            This information forms part of your official submitted nomination.
            Contact info@gbeaward.com if a correction is required.
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="border-b pb-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-2 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <nav aria-label="Application tools" className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          render={<Link href={`/portal/applications/${app.id}/documents`} />}
        >
          Documents
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/portal/applications/${app.id}/payment`} />}
        >
          Payment
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/portal/applications/${app.id}/messages`} />}
        >
          Messages
        </Button>
      </nav>
    </>
  );
}
