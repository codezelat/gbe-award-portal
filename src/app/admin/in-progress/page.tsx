import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { getInProgress } from "@/server/dal/in-progress";
import { draftStepLabels } from "@/lib/validation/nomination-draft";
import { InProgressTable } from "@/components/admin/in-progress-table";
import { DebouncedApplicationSearch } from "@/components/admin/debounced-application-search";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

export default async function InProgressPage({ searchParams }: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "applications.view_all")) notFound();
  const query = await searchParams;
  const cycleId = z.uuid().safeParse((await cookies()).get("gbe_admin_cycle")?.value).data;
  const search = query.search?.trim().slice(0, 320);
  const result = await getInProgress({ cycleId, search, page: Number.parseInt(query.page ?? "1", 10) || 1 });
  const href = (page: number) => `/admin/in-progress?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page) })}`;
  return (
    <div className="min-w-0">
      <header className="mb-6">
        <h1 className="page-heading">In-progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">{result.total} saved {result.total === 1 ? "nomination" : "nominations"}</p>
      </header>
      <form className="surface mb-5 flex flex-wrap items-center gap-3 rounded-xl p-3 sm:p-4">
        <DebouncedApplicationSearch defaultValue={search} label="Search drafts" placeholder="Search name, email or nomination" />
        <Button variant="outline" className="h-11" type="submit">Search</Button>
        {search ? <Button variant="ghost" className="h-11" render={<Link href="/admin/in-progress" />}>Clear</Button> : null}
      </form>
      {!result.rows.length ? (
        <Empty className="surface rounded-xl">
          <EmptyHeader>
            <EmptyTitle>{search ? "No matching nominations" : "No in-progress nominations"}</EmptyTitle>
            <EmptyDescription>{search ? "Try another search or clear it." : "Forms appear here after the first saved step."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <InProgressTable rows={result.rows.map((row) => ({
          ...row,
          stepLabel: draftStepLabels[row.step] ?? "Confirmation",
          updatedLabel: formatInTimeZone(row.updatedAt, "Asia/Colombo", "dd MMM yyyy, HH:mm"),
          canDelete: hasPermission(membership, "applications.edit") && (row.source === "draft" || membership.role === "super_admin"),
        }))} />
      )}
      {result.pages > 1 ? (
        <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-11" disabled={result.page === 1} render={result.page > 1 ? <Link href={href(result.page - 1)} /> : undefined}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {result.page} of {result.pages}</span>
          <Button variant="outline" className="h-11" disabled={result.page === result.pages} render={result.page < result.pages ? <Link href={href(result.page + 1)} /> : undefined}>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}
