import { redirect } from "next/navigation";
import { TablePagination } from "./table-pagination";
import { paginationSummary } from "@/lib/domain/pagination";

export function OffsetPagination({
  page,
  pageSize,
  total,
  shown,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  href: (page: number) => string;
}) {
  const { pages } = paginationSummary(page, pageSize, total, shown);
  // Deleted rows or stale bookmarks must not leave an impossible page counter.
  if (page > pages) redirect(href(pages));
  return (
    <TablePagination
      page={page}
      pageSize={pageSize}
      total={total}
      shown={shown}
      previousHref={page > 1 ? href(page - 1) : undefined}
      nextHref={page < pages ? href(page + 1) : undefined}
    />
  );
}
