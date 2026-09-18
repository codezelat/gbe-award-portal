"use client";
import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DeleteDraftButton,
  DeleteInProgressButton,
} from "@/components/admin/delete-draft-button";

export type InProgressRow = {
  id: string;
  source: string;
  nomineeName: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  nomination: string | null;
  stepLabel: string;
  updatedLabel: string;
  canDelete: boolean;
};

function detailHref(row: InProgressRow) {
  return `/admin/in-progress/${row.id}?source=${row.source}`;
}

function Nomination({ row }: { row: InProgressRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-foreground">
        {row.category ?? "Category not selected"}
      </p>
      {row.nomination ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="mt-1 block w-full truncate rounded-sm text-left text-sm leading-6 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            {row.nomination}
          </TooltipTrigger>
          <TooltipContent className="max-h-[min(20rem,60dvh)] max-w-[min(28rem,calc(100vw-2rem))] items-start overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] px-4 py-3 text-left leading-6">
            {row.nomination}
          </TooltipContent>
        </Tooltip>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Not entered yet</p>
      )}
    </div>
  );
}

export function InProgressTable({ rows }: { rows: InProgressRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = rows.filter((row) => row.canDelete);
  const selection = eligible.filter((row) => selected.includes(row.id));
  const toggle = (id: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((value) => value !== id),
    );
  const selectionBox = (row: InProgressRow) =>
    row.canDelete ? (
      <div className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          className="after:-inset-x-3.5 after:-inset-y-3.5"
          aria-label={`Select ${row.nomineeName}`}
          checked={selected.includes(row.id)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => toggle(row.id, checked)}
        />
      </div>
    ) : null;
  return (
    <div className="surface min-w-0 overflow-hidden rounded-xl">
      {eligible.length ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 border-b px-4 py-2">
          <div className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              aria-label="Select all on this page"
              checked={selection.length === eligible.length}
              indeterminate={
                selection.length > 0 && selection.length < eligible.length
              }
              onCheckedChange={(checked) =>
                setSelected(checked ? eligible.map((row) => row.id) : [])
              }
            />
            {selection.length ? `${selection.length} selected` : "Select all"}
          </div>
          {selection.length ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setSelected([])}
              >
                Clear
              </Button>
              <DeleteInProgressButton
                bulk
                records={selection.map((row) => ({
                  id: row.id,
                  source: row.source,
                  name: row.nomineeName,
                }))}
                onDeleted={(ids) =>
                  setSelected((current) =>
                    current.filter((id) => !ids.includes(id)),
                  )
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {eligible.length ? (
                <TableHead className="w-14">
                  <span className="sr-only">Select</span>
                </TableHead>
              ) : null}
              <TableHead className="w-[30%] px-4">Nominee</TableHead>
              <TableHead className="px-4">Award nomination</TableHead>
              <TableHead className="w-44 px-4">Progress</TableHead>
              <TableHead className="w-32 px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.source}:${row.id}`}>
                {eligible.length ? (
                  <TableCell className="p-1">{selectionBox(row)}</TableCell>
                ) : null}
                <TableCell className="px-4 py-4">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={detailHref(row)}
                          className="line-clamp-2 whitespace-normal font-semibold leading-6 [overflow-wrap:anywhere] hover:text-primary hover:underline focus-visible:outline-ring"
                        />
                      }
                    >
                      {row.nomineeName}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[min(28rem,calc(100vw-2rem))] [overflow-wrap:anywhere]">
                      {row.nomineeName}
                    </TooltipContent>
                  </Tooltip>
                  {row.email ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.email}
                    </p>
                  ) : null}
                  {row.phone ? (
                    <a
                      href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}
                      className="mt-1 block truncate text-xs text-muted-foreground hover:underline"
                    >
                      {row.phone}
                    </a>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Nomination row={row} />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Badge variant="secondary">{row.stepLabel}</Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {row.updatedLabel}
                  </p>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      className="h-11"
                      render={
                        <Link
                          href={detailHref(row)}
                          aria-label={`View ${row.nomineeName}`}
                        />
                      }
                    >
                      View
                    </Button>
                    {row.canDelete ? (
                      <DeleteDraftButton
                        id={row.id}
                        source={row.source}
                        name={row.nomineeName}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y xl:hidden">
        {rows.map((row) => (
          <article key={`${row.source}:${row.id}`} className="min-w-0 p-4">
            <div className="flex min-w-0 items-start gap-2">
              {selectionBox(row)}
              <Link
                href={detailHref(row)}
                className="line-clamp-2 rounded-sm font-semibold leading-6 [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-ring"
              >
                {row.nomineeName}
              </Link>
            </div>
            {row.email ? (
              <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {row.email}
              </p>
            ) : null}
            {row.phone ? (
              <a
                href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}
                className="mt-2 block text-sm text-muted-foreground hover:underline [overflow-wrap:anywhere]"
              >
                {row.phone}
              </a>
            ) : null}
            <p className="mt-3 text-xs font-medium [overflow-wrap:anywhere]">
              {row.category ?? "Category not selected"}
            </p>
            {row.nomination ? (
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {row.nomination}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="secondary">{row.stepLabel}</Badge>
              <span className="text-xs text-muted-foreground">
                {row.updatedLabel}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                className="h-11"
                render={
                  <Link
                    href={detailHref(row)}
                    aria-label={`View ${row.nomineeName}`}
                  />
                }
              >
                View details
              </Button>
              {row.canDelete ? (
                <DeleteDraftButton
                  id={row.id}
                  source={row.source}
                  name={row.nomineeName}
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
