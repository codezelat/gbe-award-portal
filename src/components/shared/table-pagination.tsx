"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { paginationSummary } from "@/lib/domain/pagination";

export function TablePagination({
  page,
  pageSize,
  total,
  shown,
  previousHref,
  nextHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  previousHref?: string;
  nextHref?: string;
}) {
  const { pages, start, end } = paginationSummary(page, pageSize, total, shown);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function control(href: string | undefined, direction: "Previous" | "Next") {
    const Icon = direction === "Previous" ? ChevronLeft : ChevronRight;
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 min-w-11 px-3"
        disabled={!href || pending}
        aria-label={`${direction} page`}
        render={
          href ? (
            <Link
              href={href}
              prefetch={false}
              onNavigate={(event) => {
                event.preventDefault();
                if (!pending) startTransition(() => router.push(href));
              }}
            />
          ) : undefined
        }
      >
        {direction === "Previous" ? <Icon data-icon="inline-start" /> : null}
        <span className="hidden sm:inline">{direction}</span>
        {direction === "Next" ? <Icon data-icon="inline-end" /> : null}
      </Button>
    );
  }
  return (
    <Pagination
      aria-label="Table pagination"
      aria-busy={pending}
      className="mt-4 flex-wrap justify-between gap-x-4 gap-y-3"
    >
      <p
        className="text-sm tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {total === 0 ? (
          "0 results"
        ) : (
          <>
            <span className="font-medium text-foreground">
              {start}-{end}
            </span>{" "}
            of {total.toLocaleString("en-GB")}
          </>
        )}
      </p>
      <PaginationContent className="gap-2">
        <PaginationItem>{control(previousHref, "Previous")}</PaginationItem>
        <PaginationItem>
          <span
            aria-current="page"
            className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap px-1 text-sm font-medium tabular-nums"
          >
            {pending ? (
              <LoaderCircle
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : null}
            Page {page} of {Math.max(page, pages)}
          </span>
        </PaginationItem>
        <PaginationItem>{control(nextHref, "Next")}</PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
