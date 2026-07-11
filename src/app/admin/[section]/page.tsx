import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applicationMessages,
  applications,
  auditLogs,
  emailOutbox,
  exportsTable,
  files,
  payments,
  profiles,
  staffMemberships,
  user,
} from "@/lib/db/schema";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { retryEmailAction } from "@/server/actions/communication-actions";
const descriptions: Record<string, string> = {
  applicants:
    "Approved profiles, linked applications, invitations and account access.",
  payments: "Submitted payment evidence, replacements and finance decisions.",
  files: "Private upload validation, purpose, size and retention state.",
  communications: "Queued, delivered and failed transactional communication.",
  exports: "Private permission-shaped Excel and CSV reports.",
  reports: "Operational totals across application and payment workflows.",
  staff: "Invitation-only staff membership, role and MFA requirements.",
  activity: "Immutable business activity by actor, action and date.",
};
const reportOptions = [
  ["applicant_contacts", "Applicant contacts", "applicants.manage"],
  ["category_summary", "Category summary", null],
  ["workflow_status", "Workflow status", null],
  ["payment_reconciliation", "Payment reconciliation", "payments.view"],
  ["file_report", "Document and file report", "files.view"],
  ["shortlisted", "Shortlisted applications", null],
  ["winners", "Winner list", null],
  ["communication_delivery", "Communication delivery", "messages.send"],
  ["audit", "Audit report", "audit.view"],
] as const;
export default async function AdminSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { section } = await params;
  const { search, page: pageParam } = await searchParams;
  const page = Math.max(
    1,
    Math.min(10_000, Number.parseInt(pageParam ?? "1", 10) || 1),
  );
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  if (!descriptions[section]) notFound();
  const { profile: currentProfile, membership } = await requireStaff();
  const requiredPermission: Record<string, string> = {
    applicants: "applicants.manage",
    payments: "payments.view",
    files: "files.view",
    communications: "applications.view_all",
    exports: "exports.create",
    reports: "applications.view_all",
    staff: "staff.manage",
    activity: "audit.view",
  };
  if (!hasPermission(membership, requiredPermission[section])) notFound();
  const db = getDb();
  let headings: string[] = [];
  let rows: Array<Array<React.ReactNode>> = [];
  if (section === "applicants") {
    const data = await db
      .select({ profile: profiles, email: user.email })
      .from(profiles)
      .innerJoin(user, eq(profiles.authUserId, user.id))
      .where(
        and(
          eq(profiles.accountKind, "applicant"),
          search
            ? or(
                ilike(profiles.displayName, `%${search}%`),
                ilike(user.email, `%${search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(profiles.displayName))
      .limit(pageSize)
      .offset(offset);
    headings = ["Applicant", "Email", "Kind", "Status", "Updated"];
    rows = data
      .filter((item) => item.profile.accountKind === "applicant")
      .map(({ profile, email }) => [
        profile.displayName,
        email,
        profile.nomineeKind,
        profile.isActive ? "Active" : "Inactive",
        formatInTimeZone(
          profile.updatedAt,
          "Asia/Colombo",
          "dd MMM yyyy, HH:mm",
        ),
      ]);
  }
  if (section === "payments") {
    const data = await db
      .select({ payment: payments, application: applications })
      .from(payments)
      .innerJoin(applications, eq(payments.applicationId, applications.id))
      .orderBy(desc(payments.updatedAt))
      .limit(pageSize)
      .offset(offset);
    headings = [
      "Application",
      "Nominee",
      "Status",
      "Amount",
      "Updated",
      "Action",
    ];
    rows = data.map(({ payment, application }) => [
      application.reference,
      application.nomineeName,
      <StatusBadge key={payment.id} status={payment.status} />,
      payment.amountMinor !== null
        ? `${payment.currency ?? ""} ${(payment.amountMinor / 100).toFixed(2)}`
        : "Not recorded",
      formatInTimeZone(payment.updatedAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
      <Button
        key={`payment-${payment.id}`}
        size="sm"
        variant="ghost"
        render={<a href={`/admin/applications/${application.id}`} />}
      >
        Review
      </Button>,
    ]);
  }
  if (section === "files") {
    const data = hasPermission(membership, "applications.view_all")
      ? await db
          .select()
          .from(files)
          .orderBy(desc(files.createdAt))
          .limit(pageSize)
          .offset(offset)
      : await db
          .select({ file: files })
          .from(files)
          .innerJoin(applicationFiles, eq(applicationFiles.fileId, files.id))
          .innerJoin(
            applications,
            eq(applicationFiles.applicationId, applications.id),
          )
          .where(eq(applications.assignedReviewerId, currentProfile.id))
          .orderBy(desc(files.createdAt))
          .limit(pageSize)
          .offset(offset)
          .then((items) => items.map((item) => item.file));
    headings = [
      "File",
      "Purpose",
      "Status",
      "Detected type",
      "Size",
      "Created",
      "Action",
    ];
    rows = data.map((file) => [
      file.safeDownloadFilename ?? "Protected object",
      file.purpose,
      file.status,
      file.mimeTypeDetected ?? "Pending",
      `${(file.sizeBytes / 1024 / 1024).toFixed(2)} MB`,
      formatInTimeZone(file.createdAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
      file.status === "ready" ? (
        <Button
          key={`file-${file.id}`}
          size="sm"
          variant="ghost"
          render={<a href={`/api/files/${file.id}/download`} />}
        >
          Open
        </Button>
      ) : (
        "—"
      ),
    ]);
  }
  if (section === "communications") {
    if (!hasPermission(membership, "messages.send")) notFound();
    const data = await db
      .select()
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(pageSize)
      .offset(offset);
    headings = [
      "Recipient",
      "Template",
      "Status",
      "Attempts",
      "Created",
      "Provider ID",
      "Action",
    ];
    rows = data.map((email) => [
      email.recipientEmail,
      email.templateKey,
      email.status,
      email.attemptCount,
      formatInTimeZone(email.createdAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
      email.providerMessageId ?? "—",
      ["failed", "cancelled"].includes(email.status) ? (
        <form key={`email-${email.id}`} action={retryEmailAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <Button size="sm" variant="outline">
            Retry
          </Button>
        </form>
      ) : (
        "—"
      ),
    ]);
  }
  if (section === "exports") {
    const data = await db
      .select()
      .from(exportsTable)
      .where(
        hasPermission(membership, "audit.view")
          ? undefined
          : eq(exportsTable.requestedBy, currentProfile.id),
      )
      .orderBy(desc(exportsTable.createdAt))
      .limit(pageSize)
      .offset(offset);
    headings = [
      "Report",
      "Format",
      "Status",
      "Rows",
      "Created",
      "Expires",
      "Action",
    ];
    rows = data.map((item) => [
      item.reportKey,
      item.format.toUpperCase(),
      item.status,
      item.rowCount ?? "—",
      formatInTimeZone(item.createdAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
      formatInTimeZone(item.expiresAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
      item.status === "ready" && item.requestedBy === currentProfile.id ? (
        <Button
          key={`export-${item.id}`}
          size="sm"
          variant="ghost"
          render={<a href={`/api/admin/exports/${item.id}/download`} />}
        >
          Download
        </Button>
      ) : (
        "—"
      ),
    ]);
  }
  if (section === "staff") {
    const data = await db
      .select({
        profile: profiles,
        membership: staffMemberships,
        email: user.email,
      })
      .from(staffMemberships)
      .innerJoin(profiles, eq(staffMemberships.profileId, profiles.id))
      .innerJoin(user, eq(profiles.authUserId, user.id))
      .orderBy(asc(profiles.displayName))
      .limit(pageSize)
      .offset(offset);
    headings = ["Staff member", "Email", "Role", "MFA required", "Status"];
    rows = data.map(({ profile, membership, email }) => [
      profile.displayName,
      email,
      membership.role.replaceAll("_", " "),
      membership.mfaRequired ? "Yes" : "No",
      membership.suspendedAt ? "Suspended" : "Active",
    ]);
  }
  if (section === "activity") {
    const data = await db
      .select({ audit: auditLogs, actor: profiles.displayName })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
      .where(
        search
          ? or(
              ilike(auditLogs.action, `%${search}%`),
              ilike(auditLogs.entityType, `%${search}%`),
              ilike(auditLogs.reason, `%${search}%`),
              ilike(profiles.displayName, `%${search}%`),
            )
          : undefined,
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);
    headings = ["Time", "Actor", "Action", "Entity", "Reason"];
    rows = data.map(({ audit, actor }) => [
      formatInTimeZone(
        audit.createdAt,
        "Asia/Colombo",
        "dd MMM yyyy, HH:mm:ss",
      ),
      actor ?? audit.actorType,
      audit.action,
      audit.entityType,
      audit.reason ?? "—",
    ]);
  }
  if (section === "reports") {
    const [[all], [review], [approved], [paymentQueue], [messages]] =
      await Promise.all([
        db.select({ value: count() }).from(applications),
        db
          .select({ value: count() })
          .from(applications)
          .where(eq(applications.workflowStatus, "under_review")),
        db
          .select({ value: count() })
          .from(applications)
          .where(eq(applications.workflowStatus, "approved")),
        db
          .select({ value: count() })
          .from(payments)
          .where(eq(payments.status, "proof_submitted")),
        db.select({ value: count() }).from(applicationMessages),
      ]);
    headings = ["Metric", "Current value"];
    rows = [
      ["All applications", all.value],
      ["Under review", review.value],
      ["Approved", approved.value],
      ["Payment proofs awaiting review", paymentQueue.value],
      ["Application messages", messages.value],
    ];
  }
  return (
    <>
      <h1 className="page-heading capitalize">{section}</h1>
      <p className="mt-2 text-graphite">{descriptions[section]}</p>
      {["applicants", "activity"].includes(section) ? (
        <form className="mt-6 flex max-w-xl gap-3">
          <Input
            name="search"
            defaultValue={search}
            placeholder="Search this operational view"
            className="h-11 bg-white"
          />
          <Button type="submit">Search</Button>
        </form>
      ) : null}
      {section === "exports" ? (
        <section className="glass-feature mt-6 rounded-lg p-5">
          <h2 className="section-title">Create secure report</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reports are permission-shaped, audited, stored privately and expire
            automatically.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="flex rounded-md border bg-white">
              <Button
                size="sm"
                variant="ghost"
                render={
                  <a href="/api/admin/exports/applications?format=xlsx" />
                }
              >
                Full application register XLSX
              </Button>
              <Button
                size="sm"
                variant="ghost"
                render={<a href="/api/admin/exports/applications?format=csv" />}
              >
                CSV
              </Button>
            </div>
            {reportOptions
              .filter(
                ([key, , permission]) =>
                  (!permission || hasPermission(membership, permission)) &&
                  (key !== "audit" || membership.role === "super_admin"),
              )
              .map(([key, label]) => (
                <div key={key} className="flex rounded-md border bg-white">
                  <Button
                    size="sm"
                    variant="ghost"
                    render={
                      <a
                        href={`/api/admin/exports/reports?report=${key}&format=xlsx`}
                      />
                    }
                  >
                    {label} XLSX
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    render={
                      <a
                        href={`/api/admin/exports/reports?report=${key}&format=csv`}
                      />
                    }
                  >
                    CSV
                  </Button>
                </div>
              ))}
          </div>
        </section>
      ) : null}
      <div className="surface mt-6 overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {headings.map((heading) => (
                <TableHead key={heading}>{heading}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={Math.max(1, headings.length)}
                  className="h-40 text-center text-muted-foreground"
                >
                  No records currently match this view.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Showing page {page} with up to {pageSize} authorised records. Use
        dedicated exports for complete reporting.
      </p>
      {section !== "reports" ? (
        <nav
          className="mt-4 flex items-center justify-between"
          aria-label="Pagination"
        >
          <Button
            variant="outline"
            disabled={page === 1}
            render={
              page > 1 ? (
                <a
                  href={`/admin/${section}?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                />
              ) : undefined
            }
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            disabled={rows.length < pageSize}
            render={
              rows.length === pageSize ? (
                <a
                  href={`/admin/${section}?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                />
              ) : undefined
            }
          >
            Next
          </Button>
        </nav>
      ) : null}
    </>
  );
}
