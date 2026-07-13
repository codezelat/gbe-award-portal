import Link from "next/link";
import { cookies } from "next/headers";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Download } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  awardCategories,
  awardCycles,
  profiles,
} from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInTimeZone } from "date-fns-tz";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { ApplicationsTable } from "@/components/admin/applications-table";
import { DebouncedApplicationSearch } from "@/components/admin/debounced-application-search";
function encodeCursor(value: { key: string; id: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decodeCursor(value: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { key?: unknown; id?: unknown };
    return typeof parsed.key === "string" &&
      typeof parsed.id === "string" &&
      isUuid(parsed.id)
      ? { key: parsed.key, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => uuidPattern.test(value);
const isDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf());
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const rawPreferredCycle = (await cookies()).get("gbe_admin_cycle")?.value;
  const preferredCycle =
    rawPreferredCycle && isUuid(rawPreferredCycle)
      ? rawPreferredCycle
      : undefined;
  const { profile: staffProfile, membership } = await requireStaff();
  const cursorHistory =
    params.cursors
      ?.split(",")
      .filter((value) => value.length < 500)
      .slice(0, 50) ?? [];
  const currentCursor = cursorHistory.at(-1);
  const page = cursorHistory.length + 1;
  const pageSize = [25, 50, 100].includes(Number(params.pageSize))
    ? Number(params.pageSize)
    : 25;
  const sort = [
    "submitted",
    "activity",
    "nominee",
    "status",
    "category",
  ].includes(params.sort ?? "")
    ? params.sort!
    : "submitted";
  const sortDirection = params.direction === "asc" ? "asc" : "desc";
  const sortColumn = {
    submitted: applications.submittedAt,
    activity: applications.lastActivityAt,
    nominee: applications.nomineeName,
    status: applications.workflowStatus,
    category: applications.categoryNameSnapshot,
  }[sort]!;
  const filters: SQL[] = [
    ne(applications.workflowStatus, "uploading"),
    isNotNull(applications.submittedAt),
  ];
  let cursorApplied = false;
  if (params.deleted === "only")
    filters.push(isNotNull(applications.deletedAt));
  else if (params.deleted !== "include")
    filters.push(isNull(applications.deletedAt));
  if (!hasPermission(membership, "applications.view_all"))
    filters.push(eq(applications.assignedReviewerId, staffProfile.id));
  const search = params.search?.trim().slice(0, 320);
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
    params.status &&
    applications.workflowStatus.enumValues.includes(params.status as never)
  )
    filters.push(
      eq(
        applications.workflowStatus,
        params.status as (typeof applications.workflowStatus.enumValues)[number],
      ),
    );
  if (
    params.paymentStatus &&
    applications.paymentStatus.enumValues.includes(
      params.paymentStatus as never,
    )
  )
    filters.push(
      eq(
        applications.paymentStatus,
        params.paymentStatus as (typeof applications.paymentStatus.enumValues)[number],
      ),
    );
  if (
    params.accountStatus &&
    applications.accountAccessStatus.enumValues.includes(
      params.accountStatus as never,
    )
  )
    filters.push(
      eq(
        applications.accountAccessStatus,
        params.accountStatus as (typeof applications.accountAccessStatus.enumValues)[number],
      ),
    );
  if (params.category && isUuid(params.category))
    filters.push(eq(applications.categoryId, params.category));
  const activeCycleFilter =
    params.cycle && isUuid(params.cycle) ? params.cycle : preferredCycle;
  if (activeCycleFilter)
    filters.push(eq(applications.cycleId, activeCycleFilter));
  if (params.reviewer && isUuid(params.reviewer))
    filters.push(eq(applications.assignedReviewerId, params.reviewer));
  if (params.dateFrom && isDate(params.dateFrom))
    filters.push(
      gte(
        applications.submittedAt,
        new Date(`${params.dateFrom}T00:00:00+05:30`),
      ),
    );
  if (params.dateTo && isDate(params.dateTo))
    filters.push(
      lte(
        applications.submittedAt,
        new Date(`${params.dateTo}T23:59:59+05:30`),
      ),
    );
  if (params.actionRequired === "true")
    filters.push(eq(applications.workflowStatus, "changes_requested"));
  if (params.hasDocuments === "true")
    filters.push(
      exists(
        getDb()
          .select({ value: sql`1` })
          .from(applicationFiles)
          .where(
            and(
              eq(applicationFiles.applicationId, applications.id),
              eq(applicationFiles.kind, "supporting_document"),
              eq(applicationFiles.isCurrent, true),
            ),
          ),
      ),
    );
  if (currentCursor) {
    const cursor = decodeCursor(currentCursor);
    if (cursor) {
      cursorApplied = true;
      const key = ["submitted", "activity"].includes(sort)
        ? new Date(cursor.key)
        : cursor.key;
      const keyComparison =
        sortDirection === "asc"
          ? sql`${sortColumn} > ${key}`
          : sql`${sortColumn} < ${key}`;
      const idComparison =
        sortDirection === "asc"
          ? gt(applications.id, cursor.id)
          : lt(applications.id, cursor.id);
      filters.push(
        or(keyComparison, and(sql`${sortColumn} = ${key}`, idComparison))!,
      );
    }
  }
  const where = filters.length ? and(...filters) : undefined;
  const countFilters = cursorApplied ? filters.slice(0, -1) : filters;
  const countWhere = countFilters.length ? and(...countFilters) : undefined;
  const db = getDb();
  const [result, [total], categories, reviewers, cycles] = await Promise.all([
    db
      .select()
      .from(applications)
      .where(where)
      .orderBy(
        sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn),
        sortDirection === "asc" ? asc(applications.id) : desc(applications.id),
      )
      .limit(pageSize + 1),
    db.select({ value: count() }).from(applications).where(countWhere),
    db
      .select({ id: awardCategories.id, name: awardCategories.name })
      .from(awardCategories)
      .where(eq(awardCategories.isActive, true))
      .orderBy(asc(awardCategories.displayOrder)),
    db
      .select({ id: profiles.id, name: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.accountKind, "staff"))
      .orderBy(asc(profiles.displayName)),
    db
      .select({ id: awardCycles.id, name: awardCycles.name })
      .from(awardCycles)
      .orderBy(desc(awardCycles.year)),
  ]);
  const hasMore = result.length > pageSize;
  const rows = result.slice(0, pageSize);
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          key:
            sort === "submitted"
              ? last.submittedAt!.toISOString()
              : sort === "activity"
                ? last.lastActivityAt.toISOString()
                : sort === "nominee"
                  ? last.nomineeName
                  : sort === "status"
                    ? last.workflowStatus
                    : last.categoryNameSnapshot,
          id: last.id,
        })
      : null;
  const exportQuery = new URLSearchParams({ format: "xlsx" });
  for (const key of [
    "search",
    "status",
    "paymentStatus",
    "accountStatus",
    "category",
    "cycle",
    "reviewer",
    "dateFrom",
    "dateTo",
    "actionRequired",
    "hasDocuments",
    "deleted",
    "sort",
    "direction",
  ])
    if (params[key]) exportQuery.set(key, params[key]);
  if (activeCycleFilter) exportQuery.set("cycle", activeCycleFilter);
  const advancedFilterKeys = [
    "paymentStatus",
    "accountStatus",
    "cycle",
    "reviewer",
    "dateFrom",
    "dateTo",
    "actionRequired",
    "hasDocuments",
    "deleted",
    "sort",
    "direction",
    "pageSize",
  ];
  const advancedFilterCount = advancedFilterKeys.filter((key) => {
    const value = params[key];
    if (!value) return false;
    if (key === "sort" && value === "submitted") return false;
    if (key === "direction" && value === "desc") return false;
    if (key === "pageSize" && value === "25") return false;
    return true;
  }).length;
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-heading">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.value} applications found
          </p>
        </div>
        <Button
          variant="outline"
          render={<a href={`/api/admin/exports/applications?${exportQuery}`} />}
        >
          <Download data-icon="inline-start" />
          Export current view
        </Button>
      </div>
      <form className="glass-shell mb-4 rounded-lg p-4">
        <div className="flex flex-wrap gap-3">
          <DebouncedApplicationSearch defaultValue={params.search} />
          <select
            name="status"
            aria-label="Workflow status"
            defaultValue={params.status ?? ""}
            className="h-11 min-w-48 rounded-md border bg-white px-3 text-sm"
          >
            <option value="">All workflow statuses</option>
            {applications.workflowStatus.enumValues
              .filter((v) => v !== "uploading")
              .map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </option>
              ))}
          </select>
          <select
            name="category"
            aria-label="Award category"
            defaultValue={params.category ?? ""}
            className="h-11 min-w-48 rounded-md border bg-white px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <Button type="submit">Apply</Button>
          <Button variant="ghost" render={<Link href="/admin/applications" />}>
            Clear
          </Button>
        </div>
        <details className="group mt-3" open={advancedFilterCount > 0}>
          <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            More filters
            {advancedFilterCount ? (
              <span className="rounded-full bg-gold-wash px-2 py-0.5 text-xs text-bronze-ink">
                {advancedFilterCount} active
              </span>
            ) : null}
            <span
              aria-hidden
              className="transition-transform group-open:rotate-180"
            >
              ⌄
            </span>
          </summary>
          <div className="mt-3 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <select
              name="paymentStatus"
              aria-label="Payment status"
              defaultValue={params.paymentStatus ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All payment statuses</option>
              {applications.paymentStatus.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              name="accountStatus"
              aria-label="Account status"
              defaultValue={params.accountStatus ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All account statuses</option>
              {applications.accountAccessStatus.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              name="cycle"
              aria-label="Award cycle"
              defaultValue={activeCycleFilter ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All award cycles</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
            <select
              name="reviewer"
              aria-label="Assigned staff member"
              defaultValue={params.reviewer ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All staff members</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name}
                </option>
              ))}
            </select>
            <Input
              name="dateFrom"
              type="date"
              defaultValue={params.dateFrom}
              aria-label="Submitted from"
              className="h-11 w-auto bg-white"
            />
            <select
              name="actionRequired"
              aria-label="Action requirement"
              defaultValue={params.actionRequired ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All action states</option>
              <option value="true">Action required</option>
            </select>
            <select
              name="hasDocuments"
              aria-label="Document state"
              defaultValue={params.hasDocuments ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">Any document state</option>
              <option value="true">Has documents</option>
            </select>
            <select
              name="deleted"
              aria-label="Deleted record visibility"
              defaultValue={params.deleted ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">Active records</option>
              <option value="include">Include soft-deleted</option>
              <option value="only">Soft-deleted only</option>
            </select>
            <select
              name="sort"
              aria-label="Sort applications by"
              defaultValue={sort}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="submitted">Submitted time</option>
              <option value="activity">Last activity</option>
              <option value="nominee">Nominee name</option>
              <option value="status">Workflow status</option>
              <option value="category">Category</option>
            </select>
            <select
              name="direction"
              defaultValue={sortDirection}
              aria-label="Sort direction"
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <select
              name="pageSize"
              defaultValue={String(pageSize)}
              aria-label="Rows per page"
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="25">25 rows</option>
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
            </select>
            <Input
              name="dateTo"
              type="date"
              defaultValue={params.dateTo}
              aria-label="Submitted to"
              className="h-11 w-auto bg-white"
            />
          </div>
        </details>
      </form>
      <div className="surface min-w-0 overflow-hidden rounded-lg">
        <ApplicationsTable
          rows={rows.map((row) => ({
            id: row.id,
            reference: row.reference,
            nomineeName: row.nomineeName,
            designation: row.designation,
            categoryNameSnapshot: row.categoryNameSnapshot,
            emailDisplay: row.emailDisplay,
            phoneDisplay: row.phoneDisplay,
            workflowStatus: row.workflowStatus,
            paymentStatus: row.paymentStatus,
            submittedLabel: row.submittedAt
              ? formatInTimeZone(
                  row.submittedAt,
                  "Asia/Colombo",
                  "dd MMM yyyy, HH:mm",
                )
              : "Uploading",
            reviewerName:
              reviewers.find(
                (reviewer) => reviewer.id === row.assignedReviewerId,
              )?.name ?? "Unassigned",
            updatedLabel: formatInTimeZone(
              row.lastActivityAt,
              "Asia/Colombo",
              "dd MMM yyyy, HH:mm",
            ),
          }))}
          reviewers={reviewers}
          exportBase={`/api/admin/exports/applications?${exportQuery}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span>
            Page {page} · {total.value} matching applications
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!cursorHistory.length}
              render={
                <Link
                  href={`?${new URLSearchParams({ ...params, cursors: cursorHistory.slice(0, -1).join(",") } as Record<string, string>)}`}
                />
              }
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!nextCursor}
              render={
                <Link
                  href={`?${new URLSearchParams({ ...params, cursors: [...cursorHistory, nextCursor ?? ""].filter(Boolean).join(",") } as Record<string, string>)}`}
                />
              }
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
