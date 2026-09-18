import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { publicEnv } from "@/lib/env";
import {
  ticketAccessToken,
  ticketDocumentToken,
} from "@/server/security/ticket-session";
import { getTicketBooking } from "./tickets";

export async function prepareTicketEmail(id: string) {
  const { booking } = await getTicketBooking(id);
  if (!["paid", "issued"].includes(booking.status)) return null;
  const url = new URL(
    `/tickets/access/${booking.id}`,
    publicEnv.NEXT_PUBLIC_APP_URL,
  );
  url.searchParams.set("token", ticketAccessToken(booking.id));
  // A stable private URL keeps provider retries identical even though PDF font
  // subsetting produces different bytes each render. Resend attaches the fetched PDF.
  const attachment = new URL(
    `/api/public/tickets/${booking.id}/download`,
    publicEnv.NEXT_PUBLIC_APP_URL,
  );
  attachment.searchParams.set("token", ticketDocumentToken(booking.id));
  return {
    booking,
    url: url.href,
    attachmentUrl: attachment.href,
    date: formatInTimeZone(
      booking.eventAt,
      "Asia/Colombo",
      "d MMMM yyyy, h:mm a",
    ),
  };
}
