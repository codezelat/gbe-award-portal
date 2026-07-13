import {
  and,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";
import { neutraliseSpreadsheetCell } from "@/server/services/export-service";
import { createTabularExport } from "@/server/services/tabular-export";
import { hasPermission } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requireExportFormat } from "@/server/services/feature-flags";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session)
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
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
  await enforceRateLimit(`export-create:${staff.profile.id}`, 20, 3600);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  await requireExportFormat(format);
  const filters: SQL[] = [];
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const paymentStatus = url.searchParams.get("paymentStatus");
  const accountStatus = url.searchParams.get("accountStatus");
  const category = url.searchParams.get("category");
  const cycle = url.searchParams.get("cycle");
  const reviewer = url.searchParams.get("reviewer");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const selectedIds = url.searchParams
    .getAll("id")
    .filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ),
    )
    .slice(0, 100);
  if (selectedIds.length) filters.push(inArray(applications.id, selectedIds));
  if (!hasPermission(staff.membership, "applications.view_all"))
    filters.push(eq(applications.assignedReviewerId, staff.profile.id));
  if (search)
    filters.push(
      or(
        ilike(applications.reference, `%${search}%`),
        ilike(applications.nomineeName, `%${search}%`),
        ilike(applications.emailNormalised, `%${search}%`),
        ilike(applications.phoneDisplay, `%${search}%`),
      )!,
    );
  if (
    paymentStatus &&
    applications.paymentStatus.enumValues.includes(paymentStatus as never)
  )
    filters.push(
      eq(
        applications.paymentStatus,
        paymentStatus as (typeof applications.paymentStatus.enumValues)[number],
      ),
    );
  if (
    accountStatus &&
    applications.accountAccessStatus.enumValues.includes(accountStatus as never)
  )
    filters.push(
      eq(
        applications.accountAccessStatus,
        accountStatus as (typeof applications.accountAccessStatus.enumValues)[number],
      ),
    );
  if (category) filters.push(eq(applications.categoryId, category));
  if (cycle) filters.push(eq(applications.cycleId, cycle));
  if (reviewer) filters.push(eq(applications.assignedReviewerId, reviewer));
  if (dateFrom)
    filters.push(
      gte(applications.submittedAt, new Date(`${dateFrom}T00:00:00+05:30`)),
    );
  if (dateTo)
    filters.push(
      lte(applications.submittedAt, new Date(`${dateTo}T23:59:59+05:30`)),
    );
  if (url.searchParams.get("actionRequired") === "true")
    filters.push(eq(applications.workflowStatus, "changes_requested"));
  if (url.searchParams.get("hasDocuments") === "true")
    filters.push(
      exists(
        db
          .select({ value: sql`1` })
          .from(applicationFiles)
          .where(eq(applicationFiles.applicationId, applications.id)),
      ),
    );
  if (url.searchParams.get("deleted") === "only")
    filters.push(isNotNull(applications.deletedAt));
  else if (url.searchParams.get("deleted") !== "include")
    filters.push(isNull(applications.deletedAt));
  if (
    status &&
    applications.workflowStatus.enumValues.includes(status as never)
  )
    filters.push(
      eq(
        applications.workflowStatus,
        status as (typeof applications.workflowStatus.enumValues)[number],
      ),
    );
  const rows = await db
    .select()
    .from(applications)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(applications.submittedAt), desc(applications.id))
    .limit(10000);
  const headings = [
    "Application reference",
    "Nominee / organisation",
    "Designation",
    "Award nomination",
    "Website",
    "Email",
    "Telephone",
    "Category",
    "Workflow status",
    "Payment status",
    "Account access",
    "Submitted (Asia/Colombo)",
    "Last activity (Asia/Colombo)",
  ];
  const values = rows.map((row) =>
    [
      row.reference,
      row.nomineeName,
      row.designation,
      row.awardNomination,
      row.businessWebsite,
      row.emailDisplay,
      row.phoneDisplay,
      row.categoryNameSnapshot,
      row.workflowStatus,
      row.paymentStatus,
      row.accountAccessStatus,
      row.submittedAt
        ? formatInTimeZone(
            row.submittedAt,
            "Asia/Colombo",
            "yyyy-MM-dd HH:mm:ss XXX",
          )
        : "",
      formatInTimeZone(
        row.lastActivityAt,
        "Asia/Colombo",
        "yyyy-MM-dd HH:mm:ss XXX",
      ),
    ].map(neutraliseSpreadsheetCell),
  );
  const exportId = await createTabularExport({
    requestedBy: staff.profile.id,
    format,
    reportKey: "application_register",
    headings,
    rows: values,
    querySnapshot: {
      search,
      status,
      paymentStatus,
      accountStatus,
      category,
      cycle,
      reviewer,
      dateFrom,
      dateTo,
      selectedIds,
      actionRequired: url.searchParams.get("actionRequired"),
      hasDocuments: url.searchParams.get("hasDocuments"),
      deleted: url.searchParams.get("deleted"),
    },
  });
  return NextResponse.redirect(
    new URL(`/api/admin/exports/${exportId}/download`, url.origin),
    303,
  );
}
