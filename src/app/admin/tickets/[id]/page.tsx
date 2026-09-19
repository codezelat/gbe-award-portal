import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowLeft, Download } from "lucide-react";
import { getDb } from "@/lib/db";
import { applications, emailOutbox, ticketSales } from "@/lib/db/schema";
import { nonDeletedApplications } from "@/server/dal/application-visibility";
import { TicketApplicationLink } from "@/components/admin/ticket-application-link";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { getTicketBooking } from "@/server/services/tickets";
import { refreshExpiredTicketBookings } from "@/server/services/ticket-payments";
import { ticketMoney, ticketStatusLabel } from "@/lib/domain/tickets";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { TicketBookingActions } from "@/components/admin/ticket-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export default async function TicketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.view")) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  let data = await getTicketBooking(id.data).catch(() => null);
  if (!data) notFound();
  if (data.booking.status === "pending") {
    await refreshExpiredTicketBookings(data.booking.salesId);
    data = await getTicketBooking(id.data);
  }
  const { booking, tickets, attempt } = data;
  const [[sale], applicationRows] = await Promise.all([
    getDb()
      .select({ cycleId: ticketSales.cycleId })
      .from(ticketSales)
      .where(eq(ticketSales.id, booking.salesId))
      .limit(1),
    booking.applicationId && hasPermission(membership, "applications.view")
      ? getDb()
          .select({
            id: applications.id,
            reference: applications.reference,
            nomination: applications.awardNomination,
          })
          .from(applications)
          .where(
            nonDeletedApplications(eq(applications.id, booking.applicationId)),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const application = applicationRows[0];
  const [email] = await getDb()
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.templateKey, "guest_tickets"),
        sql`${emailOutbox.payload}->>'bookingId' = ${booking.id}`,
      ),
    )
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  const issued = ["paid", "issued"].includes(booking.status);
  return (
    <div className="min-w-0 space-y-6">
      <Link
        href="/admin/tickets"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Tickets
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader title={booking.name} description={booking.reference} />
        <Badge variant="secondary">{ticketStatusLabel[booking.status]}</Badge>
      </div>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-muted-foreground">
              Contact
            </h2>
            <a
              className="mt-2 block text-sm hover:underline [overflow-wrap:anywhere]"
              href={`mailto:${booking.email}`}
            >
              {booking.email}
            </a>
            <a
              className="mt-2 block text-sm hover:underline"
              href={`tel:${booking.phone}`}
            >
              {booking.phone}
            </a>
            {booking.businessName && (
              <p className="mt-2 text-sm [overflow-wrap:anywhere]">
                {booking.businessName}
              </p>
            )}
          </div>
          <div>
            <h2 className="text-xs font-medium text-muted-foreground">
              Booking
            </h2>
            <p className="mt-2 text-sm">
              {booking.quantity} guests ·{" "}
              {booking.source === "staff"
                ? "Complimentary"
                : ticketMoney(booking.amountMinor, booking.currency)}
            </p>
            <p className="mt-2 text-sm">
              Email: {email?.status ?? "Not queued"}
            </p>
            {application && (
              <Link
                href={`/admin/applications/${application.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm underline [overflow-wrap:anywhere]"
              >
                {application.reference ?? "View application"}
                {application.nomination ? ` · ${application.nomination}` : ""}
              </Link>
            )}
            {booking.source === "public" &&
              sale &&
              hasPermission(membership, "payments.verify") &&
              hasPermission(membership, "applications.view") && (
                <div className="mt-3">
                  <TicketApplicationLink
                    bookingId={booking.id}
                    cycleId={sale.cycleId}
                    applicationId={booking.applicationId}
                    quantity={booking.quantity}
                  />
                </div>
              )}
          </div>
        </div>
        <div className="mt-6 border-t pt-5">
          <p className="font-medium [overflow-wrap:anywhere]">
            {booking.eventTitle}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatInTimeZone(
              booking.eventAt,
              "Asia/Colombo",
              "d MMMM yyyy, h:mm a",
            )}{" "}
            · {booking.venue}
          </p>
          {booking.internalReason && (
            <p className="mt-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              Note: {booking.internalReason}
            </p>
          )}
        </div>
      </section>
      {booking.status === "review" && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Payment was received after the reserved seats were released. Increase
          capacity and check payment again to issue tickets, or refund in Genie.
        </p>
      )}
      {attempt && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Payment details
          </summary>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Gateway status</dt>
              <dd>{attempt.state}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Transaction</dt>
              <dd className="[overflow-wrap:anywhere]">
                {attempt.transactionId ?? "Awaiting confirmation"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Local payment ID</dt>
              <dd className="[overflow-wrap:anywhere]">{attempt.id}</dd>
            </div>
          </dl>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {issued && (
          <Button
            variant="outline"
            className="h-11 min-h-11"
            render={<a href={`/api/admin/tickets/${booking.id}/download`} />}
          >
            <Download aria-hidden />
            Download tickets
          </Button>
        )}
        {hasPermission(membership, "payments.verify") && (
          <TicketBookingActions
            id={booking.id}
            issued={issued}
            complimentary={booking.source === "staff"}
            needsRecovery={!!attempt && !attempt.transactionId}
          />
        )}
      </div>
      {!!tickets.length && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Guest tickets</h2>
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">Guest {ticket.position}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {ticket.code}
                </p>
              </div>
              <Badge variant="secondary">
                {ticket.voidedAt
                  ? "Void"
                  : ticket.checkedInAt
                    ? "Checked in"
                    : "Valid"}
              </Badge>
              {!ticket.voidedAt &&
                !ticket.checkedInAt &&
                hasPermission(membership, "payments.verify") && (
                  <Button
                    className="h-11 min-h-11"
                    variant="outline"
                    render={
                      <Link href={`/admin/tickets/check-in/${ticket.id}`} />
                    }
                  >
                    Check in
                  </Button>
                )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
