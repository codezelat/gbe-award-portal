import { parsePage } from "@/lib/domain/pagination";
import { OffsetPagination } from "@/components/shared/offset-pagination";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { count, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import { exportsTable } from "@/lib/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { hasPermission, requireStaff } from "@/server/dal/auth";
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
  const page = parsePage(pageParam);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  if (section !== "exports") notFound();
  const { profile: currentProfile, membership } = await requireStaff();
  if (!hasPermission(membership, "exports.create")) notFound();
  const db = getDb();
  let headings: string[] = [];
  let rows: Array<Array<React.ReactNode>> = [];
  let total = 0;
  if (section === "exports") {
    const [counted] = await db
      .select({ value: count() })
      .from(exportsTable)
      .where(
        hasPermission(membership, "audit.view")
          ? undefined
          : eq(exportsTable.requestedBy, currentProfile.id),
      );
    total = counted.value;
    const data = await db
      .select()
      .from(exportsTable)
      .where(
        hasPermission(membership, "audit.view")
          ? undefined
          : eq(exportsTable.requestedBy, currentProfile.id),
      )
      .orderBy(desc(exportsTable.createdAt), desc(exportsTable.id))
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
  return (
    <>
      <AdminPageHeader
        title={<>{section[0].toUpperCase() + section.slice(1)}</>}
        description="Download application data and reports."
      />
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
          <TableHeader className={rows.length ? undefined : "hidden"}>
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
                  className="h-40 whitespace-normal text-center text-muted-foreground"
                >
                  No records currently match this view.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <OffsetPagination
        page={page}
        pageSize={pageSize}
        total={total}
        shown={rows.length}
        href={(next) =>
          `/admin/${section}?page=${next}${search ? `&search=${encodeURIComponent(search)}` : ""}`
        }
      />
    </>
  );
}
