import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, Ticket, XCircle } from "lucide-react";
import { getTicketAdmission } from "@/server/services/tickets";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { AdmitTicket } from "@/components/admin/ticket-controls";
import { TicketGuestDetails } from "@/components/admin/ticket-guest-details";
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.verify")) notFound();
  const ticket = await getTicketAdmission((await params).id).catch(() =>
    notFound(),
  );
  const valid = ticket.status !== "invalid";
  const used = ticket.status === "used";
  return (
    <section className="mx-auto max-w-lg rounded-2xl border bg-card p-6 sm:p-8">
      <div className="mb-5">
        {!valid ? (
          <XCircle aria-hidden className="size-10 text-destructive" />
        ) : used ? (
          <CheckCircle2 aria-hidden className="size-10 text-primary" />
        ) : (
          <Ticket aria-hidden className="size-10 text-primary" />
        )}
      </div>
      <h1 className="page-heading">
        {!valid
          ? "Ticket not valid"
          : used
            ? "Already checked in"
            : "Guest check-in"}
      </h1>
      <div className="mt-5">
        <TicketGuestDetails
          ticket={{
            ...ticket,
            application: hasPermission(membership, "applications.view")
              ? ticket.application
              : null,
          }}
        />
      </div>
      <p className="my-6 break-all font-mono text-xs text-muted-foreground">
        {ticket.code}
      </p>
      {valid && !used && <AdmitTicket id={ticket.id} />}
      {used && (
        <p className="text-sm">
          Checked in{" "}
          {formatInTimeZone(
            ticket.checkedInAt!,
            "Asia/Colombo",
            "d MMM, h:mm a",
          )}
          .
        </p>
      )}
      {/* Full navigation applies the scanner's route-specific camera policy. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/admin/tickets/scan"
        className="mt-3 flex min-h-11 items-center text-sm font-medium text-primary"
      >
        Scan another ticket
      </a>
    </section>
  );
}
