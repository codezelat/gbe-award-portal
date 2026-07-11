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
import { Download, UserRoundCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  bulkAssignReviewerAction,
  bulkChangeSafeStatusAction,
  bulkSendTemplateAction,
} from "@/server/actions/bulk-actions";
export type ApplicationTableRow = {
  id: string;
  reference: string | null;
  nomineeName: string;
  designation: string | null;
  categoryNameSnapshot: string;
  emailDisplay: string;
  phoneDisplay: string;
  workflowStatus: string;
  paymentStatus: string;
  submittedLabel: string;
  reviewerName: string;
  updatedLabel: string;
};
export function ApplicationsTable({
  rows,
  reviewers,
  exportBase,
}: {
  rows: ApplicationTableRow[];
  reviewers: Array<{ id: string; name: string }>;
  exportBase: string;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const columns = useMemo<ColumnDef<ApplicationTableRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all visible applications"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.reference}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        id: "nomination",
        header: "Nomination",
        cell: ({ row }) => (
          <div className="min-w-56 py-1">
            <Link
              href={`/admin/applications/${row.original.id}`}
              className="font-mono text-xs font-semibold text-antique-gold hover:underline"
            >
              {row.original.reference ?? "Pending reference"}
            </Link>
            <p className="font-medium">{row.original.nomineeName}</p>
            {row.original.designation ? (
              <p className="max-w-64 truncate text-xs text-muted-foreground">
                {row.original.designation}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "entry",
        header: "Category & contact",
        cell: ({ row }) => (
          <div className="min-w-52 py-1">
            <p className="max-w-64 truncate text-sm font-medium">
              {row.original.categoryNameSnapshot}
            </p>
            <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
              {row.original.emailDisplay}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.phoneDisplay}
            </p>
          </div>
        ),
      },
      {
        id: "state",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex min-w-36 flex-col items-start gap-1.5 py-1">
            <StatusBadge status={row.original.workflowStatus} />
            <StatusBadge status={row.original.paymentStatus} />
          </div>
        ),
      },
      {
        id: "activity",
        header: "Review activity",
        cell: ({ row }) => (
          <div className="min-w-44 py-1 text-xs">
            <p className="font-medium">{row.original.reviewerName}</p>
            <p className="mt-1 text-muted-foreground">
              Submitted {row.original.submittedLabel}
            </p>
            <p className="text-muted-foreground">
              Updated {row.original.updatedLabel}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            render={<Link href={`/admin/applications/${row.original.id}`} />}
          >
            Open
          </Button>
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
      <div className="hidden md:block">
        <Table className="min-w-[940px]">
          <TableHeader className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
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
                    if (event.key === "Enter")
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
      <div className="divide-y md:hidden">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <article key={row.id} className="p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={`Select ${row.original.reference ?? row.original.nomineeName}`}
                  checked={row.getIsSelected()}
                  onChange={row.getToggleSelectedHandler()}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/applications/${row.original.id}`}
                    className="font-mono text-xs font-semibold text-antique-gold"
                  >
                    {row.original.reference ?? "Pending reference"}
                  </Link>
                  <h2 className="mt-1 font-semibold leading-snug">
                    {row.original.nomineeName}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {row.original.categoryNameSnapshot}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  render={
                    <Link href={`/admin/applications/${row.original.id}`} />
                  }
                >
                  Open
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                <StatusBadge status={row.original.workflowStatus} />
                <StatusBadge status={row.original.paymentStatus} />
                <span className="text-xs text-muted-foreground">
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
      {selected.length ? (
        <div className="glass-shell sticky bottom-4 z-20 mx-3 mb-3 rounded-lg p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm">{selected.length} selected</strong>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                render={<a href={exportUrl} />}
              >
                <Download data-icon="inline-start" />
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelection({})}
              >
                Clear
              </Button>
            </div>
          </div>
          <details className="group mt-2 border-t pt-2">
            <summary className="cursor-pointer list-none py-1 text-sm font-medium text-antique-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Bulk actions{" "}
              <span
                aria-hidden
                className="inline-block transition-transform group-open:rotate-180"
              >
                ⌄
              </span>
            </summary>
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              <form action={bulkAssignReviewerAction} className="flex gap-2">
                {selected.map((id) => (
                  <input
                    key={id}
                    type="hidden"
                    name="applicationIds"
                    value={id}
                  />
                ))}
                <select
                  name="reviewerId"
                  aria-label="Assign selected applications to reviewer"
                  className="h-9 rounded-md border bg-white px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {reviewers.map((reviewer) => (
                    <option key={reviewer.id} value={reviewer.id}>
                      {reviewer.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline">
                  <UserRoundCheck data-icon="inline-start" />
                  Assign
                </Button>
              </form>
              <form action={bulkChangeSafeStatusAction} className="flex gap-2">
                {selected.map((id) => (
                  <input
                    key={id}
                    type="hidden"
                    name="applicationIds"
                    value={id}
                  />
                ))}
                <select
                  name="to"
                  aria-label="Safe bulk status"
                  className="h-9 rounded-md border bg-white px-3 text-sm"
                >
                  <option value="under_review">Move to under review</option>
                  <option value="archived">Archive eligible</option>
                </select>
                <Input
                  name="reason"
                  aria-label="Bulk status reason"
                  placeholder="Archive reason if required"
                  className="h-9 w-48 bg-white"
                />
                <Button size="sm" variant="outline">
                  Apply status
                </Button>
              </form>
              <form action={bulkSendTemplateAction} className="flex gap-2">
                {selected.map((id) => (
                  <input
                    key={id}
                    type="hidden"
                    name="applicationIds"
                    value={id}
                  />
                ))}
                <select
                  name="template"
                  aria-label="Approved communication template"
                  className="h-9 rounded-md border bg-white px-3 text-sm"
                >
                  <option value="review_update">Review update</option>
                  <option value="deadline_reminder">Deadline reminder</option>
                </select>
                <Button size="sm" variant="outline">
                  Send template
                </Button>
              </form>
            </div>
          </details>
        </div>
      ) : null}
    </>
  );
}
