import Link from "next/link";
import { cookies } from "next/headers";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  type SQL,
} from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import {
  applications,
  auditLogs,
  emailOutbox,
  invitations,
  jobRuns,
  profiles,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
export default async function AdminDashboard() {
  const { profile, membership } = await requireStaff();
  const db = getDb();
  const rawCycleId = (await cookies()).get("gbe_admin_cycle")?.value;
  const selectedCycleId =
    rawCycleId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawCycleId,
    )
      ? rawCycleId
      : undefined;
  const scope = hasPermission(membership, "applications.view_all")
    ? selectedCycleId
      ? eq(applications.cycleId, selectedCycleId)
      : undefined
    : and(
        eq(applications.assignedReviewerId, profile.id),
        selectedCycleId ? eq(applications.cycleId, selectedCycleId) : undefined,
      );
  const scoped = (condition: SQL) =>
    scope ? and(scope, condition) : condition;
  const [
    [total],
    [review],
    [approved],
    [payments],
    [actionRequired],
    recent,
    unassigned,
    failedEmails,
    expiringInvites,
    failedJobs,
    activity,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(applications)
      .where(
        scoped(
          inArray(applications.workflowStatus, [
            "submitted",
            "under_review",
            "changes_requested",
            "resubmitted",
            "approved",
            "entry_confirmed",
            "shortlisted",
            "winner",
          ]),
        ),
      ),
    db
      .select({ value: count() })
      .from(applications)
      .where(
        scoped(
          inArray(applications.workflowStatus, [
            "submitted",
            "under_review",
            "resubmitted",
          ]),
        ),
      ),
    db
      .select({ value: count() })
      .from(applications)
      .where(scoped(eq(applications.workflowStatus, "approved"))),
    db
      .select({ value: count() })
      .from(applications)
      .where(
        scoped(
          and(
            eq(applications.paymentStatus, "proof_submitted"),
            ne(applications.workflowStatus, "uploading"),
          )!,
        ),
      ),
    db
      .select({ value: count() })
      .from(applications)
      .where(scoped(eq(applications.workflowStatus, "changes_requested"))),
    db
      .select({
        id: applications.id,
        reference: applications.reference,
        nomineeName: applications.nomineeName,
        status: applications.workflowStatus,
        submittedAt: applications.submittedAt,
      })
      .from(applications)
      .where(scope)
      .orderBy(desc(applications.submittedAt))
      .limit(6),
    db
      .select({
        id: applications.id,
        reference: applications.reference,
        nomineeName: applications.nomineeName,
      })
      .from(applications)
      .where(
        scoped(
          and(
            isNull(applications.assignedReviewerId),
            inArray(applications.workflowStatus, [
              "submitted",
              "under_review",
              "resubmitted",
            ]),
          )!,
        ),
      )
      .orderBy(desc(applications.submittedAt))
      .limit(6),
    db
      .select({
        id: emailOutbox.id,
        recipient: emailOutbox.recipientEmail,
        template: emailOutbox.templateKey,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "failed"))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(6),
    db
      .select({
        id: invitations.id,
        email: invitations.emailNormalised,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          inArray(invitations.status, ["pending", "sent"]),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(invitations.expiresAt)
      .limit(6),
    db
      .select({
        id: jobRuns.id,
        key: jobRuns.jobKey,
        startedAt: jobRuns.startedAt,
      })
      .from(jobRuns)
      .where(eq(jobRuns.status, "failed"))
      .orderBy(desc(jobRuns.startedAt))
      .limit(6),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        actor: profiles.displayName,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(6),
  ]);
  const metrics = [
    {
      label: "Total submitted",
      value: total.value,
      help: "Active records in this cycle",
    },
    {
      label: "Awaiting review",
      value: review.value,
      help: "Submitted, reviewing or resubmitted",
    },
    { label: "Approved", value: approved.value, help: "Passed initial review" },
    {
      label: "Payment proofs",
      value: payments.value,
      help: "Awaiting finance verification",
    },
    {
      label: "Action required",
      value: actionRequired.value,
      help: "Applicant updates are outstanding",
    },
  ];
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-heading">Operations overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the queue, resolve exceptions, and keep nominations moving.
          </p>
        </div>
        <Link
          href="/admin/applications"
          className="text-sm font-semibold text-antique-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open applications
        </Link>
      </div>
      <section
        aria-label="Application summary"
        className="surface overflow-hidden rounded-lg"
      >
        <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 px-4 py-4 sm:px-5">
              <dt className="truncate text-xs font-medium text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-1 font-display text-3xl font-semibold leading-none">
                {metric.value}
              </dd>
              <p className="mt-2 hidden text-xs text-muted-foreground sm:block">
                {metric.help}
              </p>
            </div>
          ))}
        </dl>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <OperationalPanel
          title="Review queue"
          empty="No unassigned applications require review."
          action={{
            href: "/admin/applications?sort=submitted&direction=asc",
            label: "View queue",
          }}
          rows={unassigned.map((item) => ({
            id: item.id,
            primary: item.reference ?? "Pending reference",
            secondary: item.nomineeName,
            href: `/admin/applications/${item.id}`,
          }))}
        />
        <OperationalPanel
          title="Latest nominations"
          empty="No submitted nominations yet."
          action={{ href: "/admin/applications", label: "View all" }}
          rows={recent.map((item) => ({
            id: item.id,
            primary: item.reference ?? "Pending reference",
            secondary: `${item.nomineeName} · ${item.status.replaceAll("_", " ")}`,
            href: `/admin/applications/${item.id}`,
          }))}
        />
      </div>
      <details className="surface group mt-6 rounded-lg">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>System follow-up</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">
            Emails, invitations, jobs and staff activity
          </span>
          <span
            aria-hidden
            className="hidden text-muted-foreground group-open:inline"
          >
            −
          </span>
        </summary>
        <div className="grid gap-5 border-t p-5 xl:grid-cols-2">
          <OperationalPanel
            title="Failed emails"
            empty="No email delivery failures."
            bare
            rows={failedEmails.map((item) => ({
              id: item.id,
              primary: item.template.replaceAll("_", " "),
              secondary: `${item.recipient} · ${formatInTimeZone(item.createdAt, "Asia/Colombo", "dd MMM, HH:mm")}`,
              href: "/admin/communications",
            }))}
          />
          <OperationalPanel
            title="Expiring invitations"
            empty="No active invitations are nearing expiry."
            bare
            rows={expiringInvites.map((item) => ({
              id: item.id,
              primary: item.email,
              secondary: `Expires ${formatInTimeZone(item.expiresAt, "Asia/Colombo", "dd MMM yyyy, HH:mm")}`,
              href: "/admin/applicants",
            }))}
          />
          <OperationalPanel
            title="Failed scheduled jobs"
            empty="No recorded scheduled-job failures."
            bare
            rows={failedJobs.map((item) => ({
              id: item.id,
              primary: item.key,
              secondary: formatInTimeZone(
                item.startedAt,
                "Asia/Colombo",
                "dd MMM yyyy, HH:mm",
              ),
              href: "/admin/activity",
            }))}
          />
          <OperationalPanel
            title="Recent staff activity"
            empty="No audited activity yet."
            bare
            rows={activity.map((item) => ({
              id: item.id,
              primary: item.action,
              secondary: `${item.actor ?? "System"} · ${formatInTimeZone(item.createdAt, "Asia/Colombo", "dd MMM, HH:mm")}`,
              href: "/admin/activity",
            }))}
          />
        </div>
      </details>
    </>
  );
}

function OperationalPanel({
  title,
  empty,
  rows,
  action,
  bare = false,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; primary: string; secondary: string; href: string }>;
  action?: { href: string; label: string };
  bare?: boolean;
}) {
  return (
    <section className={bare ? "p-1" : "surface rounded-lg p-5"}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="section-title">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-semibold text-antique-gold underline-offset-4 hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-4 divide-y">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="block py-3 outline-none transition-colors hover:text-antique-gold focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-sm font-medium">{row.primary}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {row.secondary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
