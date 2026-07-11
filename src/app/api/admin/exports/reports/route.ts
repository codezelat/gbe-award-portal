import { and, asc, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  auditLogs,
  awardCategories,
  emailOutbox,
  files,
  payments,
  profiles,
  staffMemberships,
  user,
} from "@/lib/db/schema";
import { hasPermission } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { createTabularExport } from "@/server/services/tabular-export";
import { requireExportFormat } from "@/server/services/feature-flags";

const reportSchema = z.enum([
  "applicant_contacts",
  "category_summary",
  "workflow_status",
  "payment_reconciliation",
  "file_report",
  "shortlisted",
  "winners",
  "communication_delivery",
  "audit",
]);
const colombo = (value: Date | null) =>
  value
    ? formatInTimeZone(value, "Asia/Colombo", "yyyy-MM-dd HH:mm:ss XXX")
    : "";

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { message: "Sign in required." },
        { status: 401 },
      );
    const db = getDb();
    const [staff] = await db
      .select({ profile: profiles, membership: staffMemberships })
      .from(profiles)
      .innerJoin(staffMemberships, eq(staffMemberships.profileId, profiles.id))
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (
      !staff ||
      staff.membership.suspendedAt ||
      !hasPermission(staff.membership, "exports.create")
    )
      return NextResponse.json(
        { message: "Export permission required." },
        { status: 403 },
      );
    const url = new URL(request.url);
    const report = reportSchema.parse(url.searchParams.get("report"));
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    await requireExportFormat(format);
    const cycleId = z.uuid().safeParse(url.searchParams.get("cycle")).data;
    const specialisedPermission = {
      applicant_contacts: "applicants.manage",
      payment_reconciliation: "payments.view",
      file_report: "files.view",
      communication_delivery: "messages.send",
      audit: "audit.view",
    } as Partial<Record<typeof report, string>>;
    const required = specialisedPermission[report];
    if (required && !hasPermission(staff.membership, required))
      return NextResponse.json(
        { message: "This report is not permitted for your role." },
        { status: 403 },
      );
    if (report === "audit" && staff.membership.role !== "super_admin")
      return NextResponse.json(
        { message: "Super-administrator permission is required." },
        { status: 403 },
      );
    await enforceRateLimit(`export-report:${staff.profile.id}`, 20, 3600);
    let headings: string[] = [];
    let rows: unknown[][] = [];
    if (report === "applicant_contacts") {
      const data = await db
        .select({
          name: profiles.displayName,
          officialName: profiles.officialName,
          email: user.email,
          alternateEmail: profiles.alternateEmail,
          phone: profiles.phoneDisplay,
          sector: profiles.industrySector,
          country: profiles.countryCode,
          active: profiles.isActive,
          updatedAt: profiles.updatedAt,
        })
        .from(profiles)
        .innerJoin(user, eq(profiles.authUserId, user.id))
        .where(eq(profiles.accountKind, "applicant"))
        .orderBy(asc(profiles.displayName))
        .limit(10000);
      headings = [
        "Display name",
        "Official name",
        "Login email",
        "Alternate email",
        "Telephone",
        "Industry / sector",
        "Country",
        "Account active",
        "Updated (Asia/Colombo)",
      ];
      rows = data.map((item) => [
        item.name,
        item.officialName,
        item.email,
        item.alternateEmail,
        item.phone,
        item.sector,
        item.country,
        item.active ? "Yes" : "No",
        colombo(item.updatedAt),
      ]);
    } else if (report === "category_summary") {
      const data = await db
        .select({
          category: awardCategories.name,
          status: applications.workflowStatus,
          total: count(),
        })
        .from(applications)
        .innerJoin(
          awardCategories,
          eq(applications.categoryId, awardCategories.id),
        )
        .where(cycleId ? eq(applications.cycleId, cycleId) : undefined)
        .groupBy(awardCategories.name, applications.workflowStatus)
        .orderBy(awardCategories.name, applications.workflowStatus);
      headings = ["Category", "Workflow status", "Applications"];
      rows = data.map((item) => [item.category, item.status, item.total]);
    } else if (report === "workflow_status") {
      const data = await db
        .select({ status: applications.workflowStatus, total: count() })
        .from(applications)
        .where(cycleId ? eq(applications.cycleId, cycleId) : undefined)
        .groupBy(applications.workflowStatus)
        .orderBy(applications.workflowStatus);
      headings = ["Workflow status", "Applications"];
      rows = data.map((item) => [item.status, item.total]);
    } else if (report === "payment_reconciliation") {
      const data = await db
        .select({
          reference: applications.reference,
          nominee: applications.nomineeName,
          status: payments.status,
          currency: payments.currency,
          amount: payments.amountMinor,
          bankReference: payments.bankReference,
          paidAt: payments.paidAt,
          verifiedAt: payments.verifiedAt,
          updatedAt: payments.updatedAt,
        })
        .from(payments)
        .innerJoin(applications, eq(payments.applicationId, applications.id))
        .where(cycleId ? eq(applications.cycleId, cycleId) : undefined)
        .orderBy(desc(payments.updatedAt))
        .limit(10000);
      headings = [
        "Application reference",
        "Nominee / organisation",
        "Payment status",
        "Currency",
        "Amount",
        "Bank reference",
        "Paid (Asia/Colombo)",
        "Verified (Asia/Colombo)",
        "Updated (Asia/Colombo)",
      ];
      rows = data.map((item) => [
        item.reference,
        item.nominee,
        item.status,
        item.currency,
        item.amount === null ? "" : (item.amount / 100).toFixed(2),
        item.bankReference,
        colombo(item.paidAt),
        colombo(item.verifiedAt),
        colombo(item.updatedAt),
      ]);
    } else if (report === "file_report") {
      const data = await db
        .select({
          reference: applications.reference,
          filename: files.safeDownloadFilename,
          purpose: files.purpose,
          status: files.status,
          mime: files.mimeTypeDetected,
          size: files.sizeBytes,
          createdAt: files.createdAt,
        })
        .from(applicationFiles)
        .innerJoin(files, eq(applicationFiles.fileId, files.id))
        .innerJoin(
          applications,
          eq(applicationFiles.applicationId, applications.id),
        )
        .where(cycleId ? eq(applications.cycleId, cycleId) : undefined)
        .orderBy(desc(files.createdAt))
        .limit(10000);
      headings = [
        "Application reference",
        "Safe filename",
        "Purpose",
        "Validation status",
        "Detected MIME type",
        "Size bytes",
        "Created (Asia/Colombo)",
      ];
      rows = data.map((item) => [
        item.reference,
        item.filename,
        item.purpose,
        item.status,
        item.mime,
        item.size,
        colombo(item.createdAt),
      ]);
    } else if (report === "communication_delivery") {
      const data = await db
        .select({
          recipient: emailOutbox.recipientEmail,
          template: emailOutbox.templateKey,
          status: emailOutbox.status,
          attempts: emailOutbox.attemptCount,
          providerId: emailOutbox.providerMessageId,
          createdAt: emailOutbox.createdAt,
          sentAt: emailOutbox.sentAt,
        })
        .from(emailOutbox)
        .orderBy(desc(emailOutbox.createdAt))
        .limit(10000);
      headings = [
        "Recipient",
        "Template",
        "Delivery status",
        "Attempts",
        "Provider message ID",
        "Created (Asia/Colombo)",
        "Sent (Asia/Colombo)",
      ];
      rows = data.map((item) => [
        item.recipient,
        item.template,
        item.status,
        item.attempts,
        item.providerId,
        colombo(item.createdAt),
        colombo(item.sentAt),
      ]);
    } else if (report === "audit") {
      const data = await db
        .select({
          actor: profiles.displayName,
          actorType: auditLogs.actorType,
          action: auditLogs.action,
          entity: auditLogs.entityType,
          reason: auditLogs.reason,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10000);
      headings = [
        "Actor",
        "Actor type",
        "Action",
        "Entity",
        "Reason",
        "Time (Asia/Colombo)",
      ];
      rows = data.map((item) => [
        item.actor ?? "System",
        item.actorType,
        item.action,
        item.entity,
        item.reason,
        colombo(item.createdAt),
      ]);
    } else {
      const status = report === "shortlisted" ? "shortlisted" : "winner";
      const data = await db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.workflowStatus, status),
            cycleId ? eq(applications.cycleId, cycleId) : undefined,
          ),
        )
        .orderBy(
          asc(applications.categoryNameSnapshot),
          asc(applications.nomineeName),
        )
        .limit(10000);
      headings = [
        "Application reference",
        "Nominee / organisation",
        "Designation",
        "Category",
        "Email",
        "Telephone",
        "Status",
      ];
      rows = data.map((item) => [
        item.reference,
        item.nomineeName,
        item.designation,
        item.categoryNameSnapshot,
        item.emailDisplay,
        item.phoneDisplay,
        item.workflowStatus,
      ]);
    }
    const exportId = await createTabularExport({
      requestedBy: staff.profile.id,
      reportKey: report,
      format,
      headings,
      rows,
      querySnapshot: { report, cycleId },
    });
    return NextResponse.redirect(
      new URL(`/api/admin/exports/${exportId}/download`, url.origin),
      303,
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "The report could not be generated.",
      },
      { status: 400 },
    );
  }
}
