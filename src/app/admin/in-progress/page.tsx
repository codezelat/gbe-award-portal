import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { getInProgress } from "@/server/dal/in-progress";
import { draftStepLabels } from "@/lib/validation/nomination-draft";
import { DeleteDraftButton } from "@/components/admin/delete-draft-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export default async function InProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "applications.view_all")) notFound();
  const query = await searchParams;
  const cycleId = z
    .uuid()
    .safeParse((await cookies()).get("gbe_admin_cycle")?.value).data;
  const search = query.search?.trim().slice(0, 200);
  const result = await getInProgress({
    cycleId,
    search,
    page: Number.parseInt(query.page ?? "1", 10) || 1,
  });
  const href = (page: number) =>
    `/admin/in-progress?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page) })}`;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="page-heading">In-progress</h1>
        <Badge variant="secondary">{result.total}</Badge>
      </header>
      <form className="flex items-end gap-2">
        <Field className="max-w-md">
          <FieldLabel className="sr-only" htmlFor="draft-search">
            Search drafts
          </FieldLabel>
          <Input
            id="draft-search"
            name="search"
            defaultValue={search}
            placeholder="Search name, contact or nomination"
          />
        </Field>
        <Button variant="outline" type="submit">
          Search
        </Button>
        {search ? (
          <Button variant="ghost" render={<Link href="/admin/in-progress" />}>
            Clear
          </Button>
        ) : null}
      </form>
      {!result.rows.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No in-progress nominations</EmptyTitle>
            <EmptyDescription>
              {search
                ? "Try another search."
                : "Forms appear here after the first saved step."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">Nominee</TableHead>
                <TableHead className="hidden w-[30%] md:table-cell">
                  Nomination
                </TableHead>
                <TableHead>Saved step</TableHead>
                <TableHead className="hidden w-40 lg:table-cell">
                  Updated
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={`${row.source}:${row.id}`}>
                  <TableCell className="align-top">
                    <Link
                      className="block truncate font-medium hover:underline"
                      href={`/admin/in-progress/${row.id}?source=${row.source}`}
                    >
                      {row.nomineeName}
                    </Link>
                    {row.email ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {row.email}
                      </p>
                    ) : null}
                    <p className="mt-1 truncate text-xs text-muted-foreground md:hidden">
                      {row.category ?? "Category not selected"}
                    </p>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <p className="truncate text-sm">
                      {row.category ?? "Category not selected"}
                    </p>
                    {row.nomination ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className="mt-1 block w-full truncate text-left text-xs text-muted-foreground"
                            />
                          }
                        >
                          {row.nomination}
                        </TooltipTrigger>
                        <TooltipContent className="max-h-60 max-w-sm overflow-y-auto whitespace-pre-wrap break-words">
                          {row.nomination}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline">
                      {draftStepLabels[row.step] ?? "Confirmation"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                      {formatInTimeZone(
                        row.updatedAt,
                        "Asia/Colombo",
                        "dd MMM",
                      )}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {formatInTimeZone(
                      row.updatedAt,
                      "Asia/Colombo",
                      "dd MMM yyyy, HH:mm",
                    )}
                  </TableCell>
                  <TableCell>
                    {hasPermission(membership, "applications.edit") &&
                    (row.source === "draft" ||
                      membership.role === "super_admin") ? (
                      <DeleteDraftButton
                        id={row.id}
                        source={row.source}
                        name={row.nomineeName}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {result.pages > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            disabled={result.page === 1}
            render={
              result.page > 1 ? (
                <Link href={href(result.page - 1)} />
              ) : undefined
            }
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {result.page} / {result.pages}
          </span>
          <Button
            variant="outline"
            disabled={result.page === result.pages}
            render={
              result.page < result.pages ? (
                <Link href={href(result.page + 1)} />
              ) : undefined
            }
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
