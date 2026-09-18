import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Check, Clock3, Download, Ticket } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { requireTicketSession } from "@/server/security/ticket-session";
import { ticketMoney } from "@/lib/domain/tickets";
import { Button } from "@/components/ui/button";
import { TicketPaymentControls } from "@/components/tickets/payment-controls";
export default async function TicketBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await requireTicketSession(id.data).catch(() => null);
  if (!data)
    return (
      <section className="mx-auto max-w-lg py-10 text-center">
        <Ticket
          aria-hidden
          className="mx-auto mb-5 size-10 text-antique-gold"
        />
        <h1 className="page-heading">Your guest tickets</h1>
        <p className="mt-4 text-muted-foreground">
          Open the link in your ticket email or use the browser where you
          booked.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center underline"
          href="/tickets"
        >
          Back to tickets
        </Link>
      </section>
    );
  const { booking, attempt, serverNow } = data;
  const confirmed = ["paid", "issued"].includes(booking.status);
  const expired =
    booking.status === "expired" ||
    (booking.status === "pending" &&
      !attempt &&
      booking.holdUntil <= new Date());
  const pending = booking.status === "pending" && !expired;
  const title = confirmed
    ? "Your tickets are confirmed"
    : expired
      ? "Reservation expired"
      : booking.status === "cancelled"
        ? "Booking not completed"
        : booking.status === "refunded"
          ? "Booking refunded"
          : booking.status === "review"
            ? "Payment received"
            : "Complete your booking";
  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6 sm:p-9">
      <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-accent text-antique-gold">
        {confirmed ? <Check aria-hidden /> : <Clock3 aria-hidden />}
      </div>
      <h1 className="page-heading">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {confirmed
          ? `Your ${booking.quantity === 1 ? "QR ticket is" : "QR tickets are"} ready to download and queued for ${booking.email}.`
          : pending
            ? "Your seats are reserved while you complete checkout."
            : booking.status === "review"
              ? "Please contact the GBE Awards team to confirm your seats. Do not pay again."
              : "You can check availability and make a new booking."}
      </p>
      <div className="mt-7 space-y-4 border-y py-6">
        <p className="font-medium [overflow-wrap:anywhere]">
          {booking.eventTitle}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatInTimeZone(
            booking.eventAt,
            "Asia/Colombo",
            "d MMMM yyyy, h:mm a",
          )}
          <br />
          {booking.venue}
        </p>
        <div className="flex justify-between gap-4">
          <span>
            {booking.quantity} {booking.quantity === 1 ? "guest" : "guests"}
          </span>
          <strong>
            {booking.source === "staff"
              ? "Complimentary"
              : ticketMoney(booking.amountMinor, booking.currency)}
          </strong>
        </div>
      </div>
      {confirmed ? (
        <Button
          className="mt-6 h-12 min-h-12 w-full rounded-xl"
          render={<a href={`/api/public/tickets/${booking.id}/download`} />}
        >
          <Download aria-hidden />
          Download tickets
        </Button>
      ) : pending ? (
        <TicketPaymentControls
          id={booking.id}
          deadline={(attempt?.expiresAt ?? booking.holdUntil).getTime()}
          serverNow={serverNow}
          autoCheck={!!attempt?.transactionId}
          canPay={
            !attempt ||
            (!!attempt.checkoutUrl &&
              attempt.active &&
              attempt.expiresAt > new Date())
          }
        />
      ) : (
        <Button
          className="mt-6 h-12 min-h-12 w-full"
          variant="outline"
          render={<Link href="/tickets" />}
        >
          View guest tickets
        </Button>
      )}
      <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
        Need help?{" "}
        <a
          href="mailto:info@gbeaward.com"
          className="underline underline-offset-4"
        >
          Contact the GBE Awards team
        </a>
      </p>
    </section>
  );
}
