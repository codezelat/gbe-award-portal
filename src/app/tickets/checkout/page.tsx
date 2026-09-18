import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { ticketSales } from "@/lib/db/schema";
import { ticketInventory } from "@/server/services/tickets";
import { genieAvailable } from "@/server/services/genie-client";
import { TicketBookingForm } from "@/components/tickets/booking-form";
import { createTicketDetailsSession } from "@/server/security/ticket-details";
export default async function TicketCheckout({
  searchParams,
}: {
  searchParams: Promise<{ quantity?: string; sale?: string }>;
}) {
  const query = await searchParams;
  const quantity = Number(query.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
    redirect("/tickets");
  const [sale] = await getDb()
    .select()
    .from(ticketSales)
    .where(
      and(eq(ticketSales.status, "open"), gt(ticketSales.eventAt, new Date())),
    )
    .limit(1);
  if (!sale || sale.id !== query.sale || !genieAvailable())
    redirect("/tickets");
  const stock = await ticketInventory(getDb(), sale.id);
  if (
    quantity >
    Math.min(sale.maxPerBooking, sale.capacity - stock.held - stock.issued)
  )
    redirect("/tickets");
  const detailsSession = await createTicketDetailsSession({
    salesId: sale.id,
    quantity,
    acceptedUnitPriceMinor: sale.unitPriceMinor,
  });
  return (
    <div className="mx-auto max-w-xl">
      <Link
        href={`/tickets?quantity=${quantity}`}
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Guest tickets
      </Link>
      <h1 className="page-heading mb-7">Your details</h1>
      <TicketBookingForm
        quantity={quantity}
        detailsSession={detailsSession}
        sale={{
          id: sale.id,
          price: sale.unitPriceMinor,
          currency: sale.currency,
          maximum: sale.maxPerBooking,
        }}
      />
    </div>
  );
}
