import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Download, Eye, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { applicationFiles, applications, files } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { FileDispositionButton } from "@/components/admin/file-disposition-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const pageSizes = [25, 50, 100] as const;

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    purpose?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const query = await searchParams;
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "files.view")) notFound();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(query.pageSize ?? "25", 10);
  const pageSize = pageSizes.includes(requestedSize as 25 | 50 | 100)
    ? requestedSize
    : 25;
  const filters: SQL[] = [];
  if (!hasPermission(membership, "applications.view_all"))
    filters.push(eq(applications.assignedReviewerId, profile.id));
  if (query.status && files.status.enumValues.includes(query.status as never))
    filters.push(
      eq(
        files.status,
        query.status as (typeof files.status.enumValues)[number],
      ),
    );
  if (
    query.purpose &&
    files.purpose.enumValues.includes(query.purpose as never)
  )
    filters.push(
      eq(
        files.purpose,
        query.purpose as (typeof files.purpose.enumValues)[number],
      ),
    );
  if (query.search)
    filters.push(
      or(
        ilike(applications.reference, `%${query.search}%`),
        ilike(applications.nomineeName, `%${query.search}%`),
        ilike(files.safeDownloadFilename, `%${query.search}%`),
        ilike(files.originalFilename, `%${query.search}%`),
        ilike(files.objectKey, `%${query.search}%`),
      )!,
    );
  const where = filters.length ? and(...filters) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({
        file: files,
        link: applicationFiles,
        application: applications,
      })
      .from(files)
      .leftJoin(applicationFiles, eq(applicationFiles.fileId, files.id))
      .leftJoin(
        applications,
        eq(applicationFiles.applicationId, applications.id),
      )
      .where(where)
      .orderBy(desc(files.createdAt), desc(files.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(files)
      .leftJoin(applicationFiles, eq(applicationFiles.fileId, files.id))
      .leftJoin(
        applications,
        eq(applicationFiles.applicationId, applications.id),
      )
      .where(where),
  ]);
  const params = new URLSearchParams();
  for (const key of ["search", "status", "purpose"] as const)
    if (query[key]) params.set(key, query[key]!);
  params.set("pageSize", String(pageSize));
  const pageHref = (next: number) => {
    params.set("page", String(next));
    return `/admin/files?${params.toString()}`;
  };
  return (
    <>
      <h1 className="page-heading">File administration</h1>
      <p className="mt-2 text-graphite">
        Authorised validation, evidence history and retention controls. Raw R2
        credentials and permanent private URLs are never exposed.
      </p>
      <form className="surface mt-6 grid gap-3 rounded-lg p-4 lg:grid-cols-[1fr_180px_220px_120px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={query.search}
            placeholder="Application, filename or object reference"
            className="h-11 bg-white pl-9"
          />
        </label>
        <select
          name="status"
          defaultValue={query.status ?? ""}
          className="h-11 rounded-md border bg-white px-3 text-sm"
        >
          <option value="">All states</option>
          {files.status.enumValues.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="purpose"
          defaultValue={query.purpose ?? ""}
          className="h-11 rounded-md border bg-white px-3 text-sm"
        >
          <option value="">All purposes</option>
          {files.purpose.enumValues.map((purpose) => (
            <option key={purpose} value={purpose}>
              {purpose.replaceAll("_", " ")}
            </option>
          ))}
        </select>
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
        <Button className="h-11">Apply filters</Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>{total.value} matching file record(s)</p>
        {query.search || query.status || query.purpose ? (
          <Link href="/admin/files" className="underline">
            Clear filters
          </Link>
        ) : null}
      </div>
      <div className="mt-5 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Purpose / state</th>
              <th className="px-4 py-3">Validation</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(({ file, link, application }) => {
                const previewable =
                  file.mimeTypeDetected === "application/pdf" ||
                  file.mimeTypeDetected?.startsWith("image/");
                return (
                  <tr
                    key={`${file.id}:${link?.id ?? "unlinked"}`}
                    className="border-t align-top hover:bg-muted/40"
                  >
                    <td className="px-4 py-4">
                      <p className="max-w-64 truncate font-medium">
                        {file.safeDownloadFilename ?? "Protected object"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {application ? (
                        <>
                          <Link
                            href={`/admin/applications/${application.id}`}
                            className="font-mono text-xs font-semibold hover:underline"
                          >
                            {application.reference}
                          </Link>
                          <p className="mt-1">{application.nomineeName}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Operational / profile file
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p>{file.purpose.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {file.status} ·{" "}
                        {link
                          ? link.isCurrent
                            ? "current"
                            : "historical"
                          : "unlinked"}
                      </p>
                      {file.rejectionReason ? (
                        <p className="mt-2 max-w-56 text-xs text-destructive">
                          {file.rejectionReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p>{file.mimeTypeDetected ?? "Pending detection"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Claimed: {file.mimeTypeClaimed ?? "unknown"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {file.validatedAt
                          ? `Validated ${formatInTimeZone(file.validatedAt, "Asia/Colombo", "dd MMM yyyy, HH:mm")}`
                          : "Not validated"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-xs">
                      {formatInTimeZone(
                        file.createdAt,
                        "Asia/Colombo",
                        "dd MMM yyyy, HH:mm",
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-72 flex-wrap gap-2">
                        {file.status === "ready" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              render={
                                <a
                                  href={`/api/files/${file.id}/download${previewable ? "?view=1" : ""}`}
                                  target={previewable ? "_blank" : undefined}
                                  rel={previewable ? "noreferrer" : undefined}
                                />
                              }
                            >
                              {previewable ? (
                                <Eye data-icon="inline-start" />
                              ) : (
                                <Download data-icon="inline-start" />
                              )}
                              {previewable ? "Preview" : "Download"}
                            </Button>
                            {hasPermission(membership, "files.manage") ? (
                              <>
                                <FileDispositionButton
                                  fileId={file.id}
                                  mode="reject"
                                />
                                <FileDispositionButton
                                  fileId={file.id}
                                  mode="supersede"
                                />
                              </>
                            ) : null}
                          </>
                        ) : null}
                        {membership.role === "super_admin" &&
                        !link?.isCurrent &&
                        ["rejected", "superseded"].includes(file.status) ? (
                          <FileDispositionButton
                            fileId={file.id}
                            mode="delete"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="h-40 px-4 text-center text-muted-foreground"
                >
                  No files match these filters. Clear filters to return to the
                  complete authorised view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav
        className="mt-5 flex items-center justify-between"
        aria-label="File pagination"
      >
        <Button
          variant="outline"
          disabled={page === 1}
          render={page > 1 ? <Link href={pageHref(page - 1)} /> : undefined}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {Math.max(1, Math.ceil(total.value / pageSize))}
        </span>
        <Button
          variant="outline"
          disabled={page * pageSize >= total.value}
          render={
            page * pageSize < total.value ? (
              <Link href={pageHref(page + 1)} />
            ) : undefined
          }
        >
          Next
        </Button>
      </nav>
    </>
  );
}
