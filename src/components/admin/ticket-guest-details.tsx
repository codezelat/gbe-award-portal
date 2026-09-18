import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import type { TicketAdmission } from "@/server/services/tickets";

/** Shared by the scan dialog and direct QR entry, after staff authorization. */
export function TicketGuestDetails({ ticket }: { ticket: TicketAdmission }) {
  const application = ticket.application;
  return (
    <div className="min-w-0 space-y-4 text-sm [overflow-wrap:anywhere]">
      <div>
        <p className="text-lg font-semibold">{ticket.name}</p>
        {ticket.businessName && (
          <p className="mt-1 text-muted-foreground">{ticket.businessName}</p>
        )}
        <div className="mt-1 flex flex-col items-start text-muted-foreground">
          <a href={`mailto:${ticket.email}`} className="py-1 hover:underline">
            {ticket.email}
          </a>
          <a
            href={`tel:${ticket.phone.replace(/[^+\d]/g, "")}`}
            className="py-1 hover:underline"
          >
            {ticket.phone}
          </a>
        </div>
      </div>
      <div className="rounded-lg bg-muted/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            Guest {ticket.position} of {ticket.quantity}
          </p>
          <span className="rounded-full border bg-background px-2.5 py-1 text-xs">
            {ticket.complimentary ? "Complimentary" : "Paid"}
          </span>
        </div>
        <p className="mt-2 font-medium">{ticket.eventTitle}</p>
        <p className="mt-1 text-muted-foreground">
          {formatInTimeZone(
            ticket.eventAt,
            "Asia/Colombo",
            "d MMM yyyy, h:mm a",
          )}
        </p>
      </div>
      {application && (
        <div className="space-y-1.5 border-l-2 border-primary/30 pl-3">
          <Link
            href={`/admin/applications/${application.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            {application.reference ?? "View application"}
          </Link>
          <p className="font-semibold">{application.nomineeName}</p>
          <p className="text-muted-foreground">{application.category}</p>
          {application.nomination.length > 160 ? (
            <details className="group">
              <summary className="cursor-pointer py-1 font-medium">
                Award nomination
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {application.nomination}
              </p>
            </details>
          ) : (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {application.nomination}
            </p>
          )}
        </div>
      )}
      <Link
        href={`/admin/tickets/${ticket.bookingId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-2 text-muted-foreground underline-offset-4 hover:underline"
      >
        <span>Booking</span>{" "}
        <span className="font-mono text-xs">{ticket.bookingReference}</span>
      </Link>
    </div>
  );
}
