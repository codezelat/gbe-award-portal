import { and, eq, gt } from "drizzle-orm";
import { Ticket } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import { ticketSales } from "@/lib/db/schema";
import { getTicketAvailability } from "@/server/services/ticket-payments";
import { TicketAvailabilityRefresh } from "@/components/tickets/availability-refresh";
import { genieAvailable } from "@/server/services/genie-client";
import { TicketQuantity } from "@/components/tickets/ticket-quantity";
import { Progress } from "@/components/ui/progress";
import { ticketMoney } from "@/lib/domain/tickets";
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ quantity?: string }>;
}) {
  const query = await searchParams;
  const [sale] = await getDb()
    .select()
    .from(ticketSales)
    .where(
      and(eq(ticketSales.status, "open"), gt(ticketSales.eventAt, new Date())),
    )
    .limit(1);
  if (!sale)
    return (
      <section className="mx-auto max-w-lg py-16 text-center">
        <Ticket
          aria-hidden
          className="mx-auto mb-6 size-10 text-antique-gold"
        />
        <h1 className="page-heading">Guest tickets</h1>
        <p className="mt-4 text-muted-foreground">
          Reservations are not open right now.
        </p>
        <a
          className="mt-6 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          href="mailto:info@gbeaward.com"
        >
          Contact the GBE Awards team
        </a>
      </section>
    );
  const stock = await getTicketAvailability(sale.id);
  const available = Math.max(0, sale.capacity - stock.issued - stock.held);
  return (
    <div className="grid items-start gap-8 md:grid-cols-[.85fr_1.15fr] md:gap-12">
      <TicketAvailabilityRefresh
        refreshAt={stock.refreshAt}
        serverNow={stock.serverNow}
      />
      <section className="min-w-0 md:sticky md:top-28">
        <span className="text-xs font-semibold uppercase tracking-widest text-antique-gold">
          GBE Awards
        </span>
        <h1 className="page-heading mt-3">Guest tickets</h1>
        <p className="mt-5 text-lg font-medium [overflow-wrap:anywhere]">
          {sale.title}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {formatInTimeZone(
            sale.eventAt!,
            "Asia/Colombo",
            "d MMMM yyyy, h:mm a",
          )}
          <br />
          {sale.venue}
        </p>
        <div className="mt-7 border-t pt-6">
          <p className="text-2xl font-semibold tabular-nums">
            {ticketMoney(sale.unitPriceMinor, sale.currency)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              per guest
            </span>
          </p>
          <div className="mt-6 flex justify-between gap-3 text-sm">
            <span>
              {available
                ? `${available} available`
                : stock.issued >= sale.capacity
                  ? "Sold out"
                  : "All tickets are reserved"}
            </span>
            <span className="text-muted-foreground">{stock.issued} booked</span>
          </div>
          <Progress
            aria-label="Tickets booked"
            className="mt-3"
            value={Math.min(100, (stock.issued / sale.capacity) * 100)}
          />
          {available > 0 && available <= Math.ceil(sale.capacity * 0.1) && (
            <p className="mt-3 text-sm font-medium text-destructive">
              Only {available} left
            </p>
          )}
        </div>
      </section>
      {available > 0 && genieAvailable() ? (
        <TicketQuantity
          initialQuantity={Number(query.quantity) || 1}
          sale={{
            id: sale.id,
            price: sale.unitPriceMinor,
            currency: sale.currency,
            maximum: Math.min(sale.maxPerBooking, available),
          }}
        />
      ) : (
        <section className="rounded-2xl border bg-card p-7">
          <h2 className="text-lg font-semibold">
            {available
              ? "Checkout temporarily unavailable"
              : "No tickets available"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {available
              ? "Please check back shortly."
              : "Check back for any additional releases."}
          </p>
        </section>
      )}
    </div>
  );
}
