import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { ExternalLink, ScanLine, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  awardCycles,
  guestTickets,
  ticketBookings,
  ticketSales,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { ticketInventory } from "@/server/services/tickets";
import {
  ticketMoney,
  ticketStatuses,
  ticketStatusLabel,
} from "@/lib/domain/tickets";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  ComplimentaryTickets,
  TicketSettings,
} from "@/components/admin/ticket-controls";
import { OffsetPagination } from "@/components/shared/offset-pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.view")) notFound();
  const [query, jar, cycles] = await Promise.all([
    searchParams,
    cookies(),
    getDb().select().from(awardCycles).orderBy(desc(awardCycles.year)),
  ]);
  const cycle =
    cycles.find((cycle) => cycle.id === jar.get("gbe_admin_cycle")?.value) ??
    cycles[0];
  if (!cycle)
    return (
      <AdminPageHeader
        title="Tickets"
        description="Create an award cycle first."
      />
    );
  const [sale] = await getDb()
    .select()
    .from(ticketSales)
    .where(eq(ticketSales.cycleId, cycle.id))
    .limit(1);
  const stock = sale
    ? await ticketInventory(getDb(), sale.id)
    : { issued: 0, held: 0 };
  const available = Math.max(
    0,
    (sale?.capacity ?? 0) - stock.issued - stock.held,
  );
  const search = query.search?.trim().slice(0, 100) ?? "";
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const status = ticketStatuses.find((status) => status === query.status);
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(query.page ?? "1", 10) || 1),
  );
  const filter = and(
    eq(
      ticketBookings.salesId,
      sale?.id ?? "00000000-0000-4000-8000-000000000000",
    ),
    status ? eq(ticketBookings.status, status) : undefined,
    search
      ? or(
          ilike(ticketBookings.name, `%${escaped}%`),
          ilike(ticketBookings.reference, `%${escaped}%`),
          ilike(ticketBookings.email, `%${escaped}%`),
          ilike(ticketBookings.phone, `%${escaped}%`),
          sql`exists (select 1 from ${guestTickets} where ${guestTickets.bookingId} = ${sql.identifier("ticket_bookings")}.${sql.identifier("id")} and ${guestTickets.code} ilike ${`%${escaped}%`})`,
        )
      : undefined,
  );
  const [[totals], bookings] = await Promise.all([
    getDb().select({ total: count() }).from(ticketBookings).where(filter),
    getDb()
      .select()
      .from(ticketBookings)
      .where(filter)
      .orderBy(desc(ticketBookings.createdAt), desc(ticketBookings.id))
      .limit(25)
      .offset((page - 1) * 25),
  ]);
  const href = (page: number) =>
    `/admin/tickets?${new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), page: String(page) })}`;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader title="Tickets" description={cycle.name} />
        <div className="flex flex-wrap gap-2">
          {hasPermission(membership, "payments.verify") && (
            <Button
              className="h-11 min-h-11"
              // Full navigation applies the scanner's route-specific camera policy.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              render={<a href="/admin/tickets/scan" />}
            >
              <ScanLine aria-hidden />
              Event check-in
            </Button>
          )}
          {hasPermission(membership, "configuration.manage") && (
            <TicketSettings
              key={sale?.revision ?? cycle.id}
              cycleId={cycle.id}
              cycleName={cycle.name}
              sale={sale}
            />
          )}
          {sale && hasPermission(membership, "payments.verify") && (
            <ComplimentaryTickets salesId={sale.id} cycleId={cycle.id} />
          )}
        </div>
      </div>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">
              {sale?.title ?? "Sales not configured"}
            </h2>
            <Badge variant="secondary">
              {sale?.status === "open"
                ? "On sale"
                : sale?.status === "paused"
                  ? "Paused"
                  : sale?.status === "closed"
                    ? "Closed"
                    : "Draft"}
            </Badge>
          </div>
          <Button
            variant="ghost"
            className="h-11 min-h-11"
            render={
              <Link href="/tickets" target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLink aria-hidden />
            Public page
          </Button>
        </div>
        {sale ? (
          <>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {stock.issued}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Issued</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {stock.held}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Reserved</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {available}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Available</p>
              </div>
            </div>
            <Progress
              aria-label="Capacity used"
              className="mt-5"
              value={
                sale.capacity
                  ? ((stock.issued + stock.held) / sale.capacity) * 100
                  : 0
              }
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {sale.capacity} total ·{" "}
              {ticketMoney(sale.unitPriceMinor, sale.currency)} per guest
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Set a price and capacity, then open sales when you are ready.
          </p>
        )}
      </section>
      <form className="flex flex-col gap-3 sm:flex-row" action="/admin/tickets">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="absolute top-3.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            name="search"
            aria-label="Search bookings"
            defaultValue={search}
            maxLength={100}
            placeholder="Name, email, phone or ticket code"
            className="h-11 min-h-11 pl-9"
          />
        </div>
        <select
          name="status"
          aria-label="Booking status"
          defaultValue={status ?? ""}
          className="h-11 min-h-11 rounded-lg border bg-card px-3 text-sm"
        >
          <option value="">All bookings</option>
          {ticketStatuses.map((value) => (
            <option key={value} value={value}>
              {ticketStatusLabel[value]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" className="h-11 min-h-11">
          Search
        </Button>
      </form>
      {bookings.length ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/admin/tickets/${booking.id}`}
                        className="block py-2 font-medium hover:underline [overflow-wrap:anywhere]"
                      >
                        {booking.name}
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {booking.reference}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{booking.quantity}</TableCell>
                    <TableCell>
                      {booking.source === "staff"
                        ? "Complimentary"
                        : ticketMoney(booking.amountMinor, booking.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ticketStatusLabel[booking.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInTimeZone(
                        booking.createdAt,
                        "Asia/Colombo",
                        "d MMM, h:mm a",
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/admin/tickets/${booking.id}`}
                className="block rounded-xl border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="min-w-0 [overflow-wrap:anywhere]">
                    {booking.name}
                  </strong>
                  <Badge variant="secondary">
                    {ticketStatusLabel[booking.status]}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {booking.reference}
                </p>
                <p className="mt-3 text-sm">
                  {booking.quantity} guests ·{" "}
                  {booking.source === "staff"
                    ? "Complimentary"
                    : ticketMoney(booking.amountMinor, booking.currency)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {search || status ? "No matching bookings." : "No bookings yet."}
        </p>
      )}
      <OffsetPagination
        page={page}
        pageSize={25}
        total={totals.total}
        shown={bookings.length}
        href={href}
      />
    </div>
  );
}
