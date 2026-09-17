import Link from "next/link";
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
import { DeleteDraftButton } from "@/components/admin/delete-draft-button";

export type InProgressRow = {
  id: string;
  source: string;
  nomineeName: string;
  email: string | null;
  category: string | null;
  nomination: string | null;
  stepLabel: string;
  updatedLabel: string;
  canDelete: boolean;
};

function detailHref(row: InProgressRow) {
  return row.source === "card"
    ? `/admin/applications/${row.id}`
    : `/admin/in-progress/${row.id}?source=${row.source}`;
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
  return (
    <div className="surface min-w-0 overflow-hidden rounded-xl">
      <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
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
            <Link
              href={detailHref(row)}
              className="line-clamp-2 rounded-sm font-semibold leading-6 [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-ring"
            >
              {row.nomineeName}
            </Link>
            {row.email ? (
              <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {row.email}
              </p>
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
