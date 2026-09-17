export function parsePage(value?: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100_000) : 1;
}

export function paginationSummary(
  page: number,
  pageSize: number,
  total: number,
  shown: number,
) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = shown > 0 ? Math.min(total, (page - 1) * pageSize + 1) : 0;
  const end = shown > 0 ? Math.min(total, start + shown - 1) : 0;
  return { pages, start, end };
}
