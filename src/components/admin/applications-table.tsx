"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ApplicationBulkActions } from "@/components/admin/application-bulk-actions";
import type {
  BulkPermissions,
  BulkSelection,
} from "@/lib/domain/bulk-applications";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export type ApplicationTableRow = BulkSelection & {
  id: string;
  reference: string | null;
  nomineeName: string;
  designation: string | null;
  categoryNameSnapshot: string;
  awardNomination: string;
  emailDisplay: string;
  phoneDisplay: string;
  paymentStatus: string;
  submittedLabel: string;
  reviewerName: string;
  updatedLabel: string;
};
export function ApplicationsTable({
  rows,
  reviewers,
  exportBase,
  permissions,
}: {
  rows: ApplicationTableRow[];
  reviewers: Array<{ id: string; name: string }>;
  exportBase: string;
  permissions: BulkPermissions;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const columns = useMemo<ColumnDef<ApplicationTableRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all visible applications"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.reference ?? row.original.nomineeName}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
      },
      {
        id: "nomination",
        header: "Nominee",
        cell: ({ row }) => (
          <div className="min-w-0 py-1">
            <Link
              href={`/admin/applications/${row.original.id}`}
              className="font-mono text-xs font-semibold text-antique-gold hover:underline"
            >
              {row.original.reference ?? "Pending reference"}
            </Link>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/admin/applications/${row.original.id}`}
                    className="mt-1 block truncate font-semibold hover:text-primary hover:underline"
                  />
                }
              >
                {row.original.nomineeName}
              </TooltipTrigger>
              <TooltipContent className="max-w-[min(28rem,calc(100vw-2rem))] [overflow-wrap:anywhere]">
                {row.original.nomineeName}
              </TooltipContent>
            </Tooltip>
            {row.original.designation ? (
              <p className="max-w-64 truncate text-xs text-muted-foreground">
                {row.original.designation}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "nomination-summary",
        header: "Award nomination",
        cell: ({ row }) => (
          <div className="min-w-0 py-1">
            <p className="truncate text-sm font-medium">
              {row.original.categoryNameSnapshot}
            </p>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="mt-1 block max-w-full truncate text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                {row.original.awardNomination}
              </TooltipTrigger>
              <TooltipContent className="max-h-[min(20rem,60dvh)] max-w-[min(28rem,calc(100vw-2rem))] items-start overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] px-4 py-3 text-left leading-5">
                <span className="font-medium text-background">
                  {row.original.categoryNameSnapshot}
                </span>
                <span>{row.original.awardNomination}</span>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
      },
      {
        id: "state",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1.5 py-1">
            <StatusBadge status={row.original.workflowStatus} />
            <StatusBadge status={row.original.paymentStatus} />
          </div>
        ),
      },
      {
        id: "submitted",
        header: "Submitted",
        cell: ({ row }) => (
          <div className="min-w-0 py-1 text-xs">
            <p className="text-foreground">{row.original.submittedLabel}</p>
            <p className="mt-1 truncate text-muted-foreground">
              {row.original.reviewerName === "Unassigned"
                ? "Unassigned"
                : `Reviewer: ${row.original.reviewerName}`}
            </p>
          </div>
        ),
      },
    ],
    [],
  );
  // TanStack Table intentionally exposes a mutable table instance; React Compiler
  // cannot memoize this hook, but the instance remains scoped to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    enableRowSelection: true,
  });
  const selected = table
    .getSelectedRowModel()
    .rows.map((row) => row.original.id);
  const exportUrl = `${exportBase}&${selected.map((id) => `id=${encodeURIComponent(id)}`).join("&")}`;
  return (
    <>
      {selected.length > 0 && (
        <ApplicationBulkActions
          selected={table.getSelectedRowModel().rows.map((row) => row.original)}
          reviewers={reviewers}
          permissions={permissions}
          exportUrl={exportUrl}
          onClear={() => setSelection({})}
        />
      )}
      {rows.length > 0 && (
        <label className="flex min-h-12 items-center gap-3 border-b px-4 text-sm xl:hidden">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked)
            }
          />
          Select this page
        </label>
      )}
      <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === "select"
                        ? "w-10"
                        : header.id === "nomination"
                          ? "w-[28%]"
                          : header.id === "state"
                            ? "w-40"
                            : header.id === "submitted"
                              ? "w-40"
                              : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest(
                        "a,button,input,select,textarea,label",
                      )
                    )
                      router.push(`/admin/applications/${row.original.id}`);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      event.target === event.currentTarget
                    )
                      router.push(`/admin/applications/${row.original.id}`);
                  }}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-48 text-center text-muted-foreground"
                >
                  No applications match this view.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y xl:hidden">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <article
              key={row.id}
              className="p-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  className="mt-1"
                  aria-label={`Select ${row.original.reference ?? row.original.nomineeName}`}
                  checked={row.getIsSelected()}
                  onCheckedChange={(checked) => row.toggleSelected(checked)}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/applications/${row.original.id}`}
                    className="font-mono text-xs font-semibold text-antique-gold"
                  >
                    {row.original.reference ?? "Pending reference"}
                  </Link>
                  <Link
                    href={`/admin/applications/${row.original.id}`}
                    className="mt-1 line-clamp-2 font-semibold leading-snug [overflow-wrap:anywhere] hover:text-primary hover:underline"
                  >
                    {row.original.nomineeName}
                  </Link>
                  <p className="mt-1 text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
                    {row.original.categoryNameSnapshot}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {row.original.awardNomination}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                <StatusBadge status={row.original.workflowStatus} />
                <StatusBadge status={row.original.paymentStatus} />
                <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {row.original.reviewerName}
                </span>
              </div>
            </article>
          ))
        ) : (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">
            No applications match this view.
          </p>
        )}
      </div>
    </>
  );
}
