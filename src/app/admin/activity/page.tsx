import { OffsetPagination } from "@/components/shared/offset-pagination";
import { parsePage } from "@/lib/domain/pagination";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { applications, auditLogs, profiles } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const pageSizes = [25, 50, 100] as const;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    actor?: string;
    action?: string;
    entity?: string;
    application?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const query = await searchParams;
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "audit.view")) notFound();
  const page = parsePage(query.page);
  const requestedSize = Number.parseInt(query.pageSize ?? "25", 10);
  const pageSize = pageSizes.includes(requestedSize as 25 | 50 | 100)
    ? requestedSize
    : 25;
  const filters: SQL[] = [];
  if (query.search)
    filters.push(
      or(
        ilike(auditLogs.action, `%${query.search}%`),
        ilike(auditLogs.entityType, `%${query.search}%`),
        ilike(auditLogs.reason, `%${query.search}%`),
        ilike(profiles.displayName, `%${query.search}%`),
        ilike(applications.reference, `%${query.search}%`),
      )!,
    );
  if (query.actor)
    filters.push(ilike(profiles.displayName, `%${query.actor}%`));
  if (query.action) filters.push(ilike(auditLogs.action, `%${query.action}%`));
  if (query.entity) filters.push(eq(auditLogs.entityType, query.entity));
  if (query.application)
    filters.push(ilike(applications.reference, `%${query.application}%`));
  if (query.dateFrom) {
    const value = new Date(`${query.dateFrom}T00:00:00+05:30`);
    if (!Number.isNaN(value.getTime()))
      filters.push(gte(auditLogs.createdAt, value));
  }
  if (query.dateTo) {
    const value = new Date(`${query.dateTo}T23:59:59.999+05:30`);
    if (!Number.isNaN(value.getTime()))
      filters.push(lte(auditLogs.createdAt, value));
  }
  const where = filters.length ? and(...filters) : undefined;
  const db = getDb();
  const [rows, [total], entityRows] = await Promise.all([
    db
      .select({
        audit: auditLogs,
        actor: profiles.displayName,
        applicationReference: applications.reference,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
      .leftJoin(applications, eq(auditLogs.applicationId, applications.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
      .leftJoin(applications, eq(auditLogs.applicationId, applications.id))
      .where(where),
    db
      .selectDistinct({ value: auditLogs.entityType })
      .from(auditLogs)
      .orderBy(auditLogs.entityType),
  ]);
  const params = new URLSearchParams();
  for (const key of [
    "search",
    "actor",
    "action",
    "entity",
    "application",
    "dateFrom",
    "dateTo",
  ] as const)
    if (query[key]) params.set(key, query[key]!);
  params.set("pageSize", String(pageSize));
  const pageHref = (next: number) => {
    params.set("page", String(next));
    return `/admin/activity?${params.toString()}`;
  };
  return (
    <>
      <AdminPageHeader
        title={<>Audit activity</>}
        description={<>Review staff actions and system activity.</>}
      />
      <form className="surface mt-6 grid gap-3 rounded-lg p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={query.search}
            placeholder="Search actor, action, reason or application"
            className="h-11 bg-white pl-9"
          />
        </label>
        <Button className="h-11">Apply filters</Button>
        <details
          className="sm:col-span-2"
          open={Boolean(
            query.actor ||
            query.action ||
            query.entity ||
            query.application ||
            query.dateFrom ||
            query.dateTo,
          )}
        >
          <summary className="flex min-h-11 w-fit cursor-pointer items-center text-sm text-muted-foreground">
            More filters
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              name="actor"
              defaultValue={query.actor}
              placeholder="Actor name"
              className="h-11 bg-white"
            />
            <Input
              name="action"
              defaultValue={query.action}
              placeholder="Action contains"
              className="h-11 bg-white"
            />
            <select
              name="entity"
              defaultValue={query.entity ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All entity types</option>
              {entityRows.map(({ value }) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <Input
              name="application"
              defaultValue={query.application}
              placeholder="Application reference"
              className="h-11 bg-white"
            />
            <Input
              name="dateFrom"
              type="date"
              defaultValue={query.dateFrom}
              aria-label="Audit from date"
              className="h-11 bg-white"
            />
            <Input
              name="dateTo"
              type="date"
              defaultValue={query.dateTo}
              aria-label="Audit to date"
              className="h-11 bg-white"
            />
            <select
              name="pageSize"
              defaultValue={pageSize}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        </details>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{total.value} matching audit event(s)</p>
        {filters.length ? (
          <Link href="/admin/activity" className="underline">
            Clear filters
          </Link>
        ) : null}
      </div>
      <div className="data-table-scroll mt-5 overflow-x-auto rounded-lg border bg-white">
        <table
          className={`w-full text-left text-sm ${rows.length ? "min-w-[1050px]" : ""}`}
        >
          <thead
            className={
              rows.length
                ? "sticky top-0 bg-muted text-xs uppercase tracking-wider text-muted-foreground"
                : "hidden"
            }
          >
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Reason / context</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(({ audit, actor, applicationReference }) => (
                <tr
                  key={audit.id}
                  className="border-t align-top hover:bg-muted/40"
                >
                  <td className="px-4 py-4 text-xs">
                    {formatInTimeZone(
                      audit.createdAt,
                      "Asia/Colombo",
                      "dd MMM yyyy, HH:mm:ss",
                    )}
                  </td>
                  <td className="px-4 py-4">{actor ?? audit.actorType}</td>
                  <td className="px-4 py-4 font-medium">{audit.action}</td>
                  <td className="px-4 py-4">
                    {audit.entityType.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-4">
                    {applicationReference ? (
                      <Link
                        href={`/admin/applications/${audit.applicationId}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {applicationReference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-w-80 whitespace-pre-wrap text-sm">
                      {audit.reason ?? "No reason required"}
                    </p>
                    {audit.requestId ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Request {audit.requestId}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="h-40 text-center text-muted-foreground"
                >
                  No audit records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <OffsetPagination
        page={page}
        pageSize={pageSize}
        total={total.value}
        shown={rows.length}
        href={pageHref}
      />
    </>
  );
}
