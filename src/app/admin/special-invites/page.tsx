import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import { awardCycles } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { getSpecialInvites } from "@/server/dal/special-invites";
import {
  GenerateInvites,
  InviteDownload,
  CancelInvite,
} from "@/components/admin/special-invite-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const money = (amount: number, currency: string) =>
  `${currency} ${(amount / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const statusLabels = {
  unused: "Unused",
  active: "In-progress",
  used: "Used",
  expired: "Expired",
  cancelled: "Cancelled",
};
export default async function SpecialInvitesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    page?: string;
    search?: string;
    batch?: string;
  }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.view")) notFound();
  const canManage = hasPermission(membership, "configuration.manage");
  const [query, cookieStore, cycles] = await Promise.all([
    searchParams,
    cookies(),
    getDb()
      .select()
      .from(awardCycles)
      .orderBy(desc(awardCycles.year), desc(awardCycles.createdAt)),
  ]);
  const cycle =
    cycles.find(
      (row) => row.id === cookieStore.get("gbe_admin_cycle")?.value,
    ) ?? cycles[0];
  if (!cycle)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No award cycle</EmptyTitle>
          <EmptyDescription>Create an award cycle first.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const history = query.view === "history";
  const search = query.search?.trim().slice(0, 6);
  const batch = z.uuid().safeParse(query.batch).data;
  const result = await getSpecialInvites({
    cycleId: cycle.id,
    history,
    search,
    batch,
    page: Number.parseInt(query.page ?? "1", 10),
  });
  const href = (page: number, isHistory = history) =>
    `/admin/special-invites?${new URLSearchParams({ ...(isHistory ? { view: "history" } : {}), ...(search ? { search } : {}), ...(batch ? { batch } : {}), page: String(page) })}`;
  const nominee = (row: (typeof result.rows)[number]) =>
    row.href ? (
      <Link
        href={row.href}
        className="line-clamp-2 font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere]"
      >
        {row.name ?? "View nomination"}
        {row.reference ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {row.reference}
          </span>
        ) : null}
      </Link>
    ) : (
      <span className="text-muted-foreground">
        {row.status === "unused" ? "Not claimed" : "Unavailable"}
      </span>
    );
  const status = (row: (typeof result.rows)[number]) => (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="secondary">{statusLabels[row.status]}</Badge>
      {row.status === "active" && row.expiresAt ? (
        <span className="text-xs text-muted-foreground">
          Ends{" "}
          {formatInTimeZone(row.expiresAt, "Asia/Colombo", "d MMM, h:mm a")}
        </span>
      ) : null}
    </div>
  );
  const actions = (row: (typeof result.rows)[number]) =>
    row.status === "unused" && canManage ? (
      <div className="flex items-center gap-1">
        <InviteDownload id={row.id} />
        <CancelInvite id={row.id} code={row.code} />
      </div>
    ) : null;
  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-heading">Special invites</h1>
          <p className="mt-1 text-sm text-foreground/75">{cycle.name}</p>
        </div>
        {canManage && cycle.currency ? (
          <GenerateInvites
            key={cycle.id}
            cycleId={cycle.id}
            cycleName={cycle.name}
            currency={cycle.currency}
          />
        ) : null}
      </header>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Invite status" className="flex flex-wrap gap-2">
          <Button
            className="h-11"
            variant={history ? "ghost" : "secondary"}
            render={
              <Link
                href={href(1, false)}
                aria-current={!history ? "page" : undefined}
              />
            }
          >
            Unused
          </Button>
          <Button
            className="h-11"
            variant={history ? "secondary" : "ghost"}
            render={
              <Link
                href={href(1, true)}
                aria-current={history ? "page" : undefined}
              />
            }
          >
            Claimed & used
          </Button>
        </nav>
        <span className="text-sm text-foreground/75">
          {result.total} {result.total === 1 ? "invite" : "invites"}
        </span>
      </div>
      <form className="surface mb-5 flex flex-wrap items-center gap-2 rounded-xl p-3">
        {history ? <input type="hidden" name="view" value="history" /> : null}
        {batch ? <input type="hidden" name="batch" value={batch} /> : null}
        <Input
          name="search"
          aria-label="Search invite code"
          placeholder="Search code"
          defaultValue={search}
          maxLength={6}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 basis-40"
        />
        <Button type="submit" variant="outline" className="h-11">
          Search
        </Button>
        {batch && canManage && !history ? (
          <InviteDownload batch={batch} />
        ) : null}
        {search || batch ? (
          <Button
            variant="ghost"
            className="h-11"
            render={
              <Link
                href={`/admin/special-invites${history ? "?view=history" : ""}`}
              />
            }
          >
            Clear
          </Button>
        ) : null}
      </form>
      {!result.rows.length ? (
        <Empty className="surface rounded-xl">
          <EmptyHeader>
            <EmptyTitle>No {history ? "claimed" : "unused"} invites</EmptyTitle>
            <EmptyDescription>
              {search || batch
                ? "Try another code or clear the filter."
                : history
                  ? "Claims will appear here with their nomination."
                  : "Generate a batch when you need it."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="surface min-w-0 overflow-hidden rounded-xl">
          <div className="hidden xl:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 px-4">Code</TableHead>
                  <TableHead className="w-36 px-4">Discount</TableHead>
                  <TableHead className="px-4">
                    {history ? "Nomination" : "Issued"}
                  </TableHead>
                  {history ? (
                    <TableHead className="w-40 px-4">Status</TableHead>
                  ) : null}
                  {!history && canManage ? (
                    <TableHead className="w-44 px-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 py-4 font-mono font-semibold tracking-wider">
                      {row.code}
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      {money(row.discountMinor, row.currency)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-4">
                      {history
                        ? nominee(row)
                        : formatInTimeZone(
                            row.createdAt,
                            "Asia/Colombo",
                            "d MMM yyyy, h:mm a",
                          )}
                    </TableCell>
                    {history ? (
                      <TableCell className="px-4 py-4">{status(row)}</TableCell>
                    ) : null}
                    {!history && canManage ? (
                      <TableCell className="px-4 py-4">
                        {actions(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="divide-y xl:hidden">
            {result.rows.map((row) => (
              <article key={row.id} className="flex min-w-0 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold tracking-wider">
                      {row.code}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {money(row.discountMinor, row.currency)} off
                    </p>
                  </div>
                  {history ? status(row) : actions(row)}
                </div>
                {history ? (
                  <div className="min-w-0 text-sm">{nominee(row)}</div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {formatInTimeZone(
                      row.createdAt,
                      "Asia/Colombo",
                      "d MMM yyyy, h:mm a",
                    )}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
      {result.pages > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-5 flex items-center justify-between gap-2"
        >
          <Button
            variant="outline"
            className="h-11"
            disabled={result.page === 1}
            render={
              result.page > 1 ? (
                <Link href={href(result.page - 1)} />
              ) : undefined
            }
          >
            Previous
          </Button>
          <span className="text-sm">
            {result.page} / {result.pages}
          </span>
          <Button
            variant="outline"
            className="h-11"
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
