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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <div className="mb-8">
        <h1 className="page-heading">Operations overview</h1>
        <p className="mt-2 text-graphite">
          Current work requiring attention across GBE Awards 2026.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="font-display text-4xl">
                {metric.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {metric.help}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <OperationalPanel
          title="Recent submissions"
          empty="No submitted nominations yet."
          rows={recent.map((item) => ({
            id: item.id,
            primary: item.reference ?? "Pending reference",
            secondary: `${item.nomineeName} · ${item.status.replaceAll("_", " ")}`,
            href: `/admin/applications/${item.id}`,
          }))}
        />
        <OperationalPanel
          title="Unassigned review queue"
          empty="No unassigned applications require review."
          rows={unassigned.map((item) => ({
            id: item.id,
            primary: item.reference ?? "Pending reference",
            secondary: item.nomineeName,
            href: `/admin/applications/${item.id}`,
          }))}
        />
        <OperationalPanel
          title="Failed emails"
          empty="No email delivery failures."
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
          rows={activity.map((item) => ({
            id: item.id,
            primary: item.action,
            secondary: `${item.actor ?? "System"} · ${formatInTimeZone(item.createdAt, "Asia/Colombo", "dd MMM, HH:mm")}`,
            href: "/admin/activity",
          }))}
        />
      </div>
    </>
  );
}

function OperationalPanel({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; primary: string; secondary: string; href: string }>;
}) {
  return (
    <section className="surface rounded-lg p-6">
      <h2 className="section-title">{title}</h2>
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
