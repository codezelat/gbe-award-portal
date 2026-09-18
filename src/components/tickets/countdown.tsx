"use client";
import { Clock3 } from "lucide-react";
import { ticketTimeLeft } from "@/lib/domain/ticket-timing";
export function TicketCountdown({
  deadline,
  now,
  label,
  expiredLabel,
}: {
  deadline: number;
  now: number;
  label: string;
  expiredLabel: string;
}) {
  const expired = now >= deadline;
  return (
    <div className="mb-5 flex min-w-0 items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-inset ring-red-200">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Clock3 aria-hidden className="size-4 shrink-0" />
        {expired ? expiredLabel : label}
      </span>
      {!expired && (
        <span
          role="timer"
          aria-label={label}
          className="shrink-0 text-xl font-semibold tabular-nums"
        >
          {ticketTimeLeft(deadline, now)}
        </span>
      )}
    </div>
  );
}
