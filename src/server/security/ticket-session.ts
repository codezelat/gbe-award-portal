import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, publicEnv } from "@/lib/env";
import {
  getTicketBooking,
  TicketError,
  ticketSecretMatches,
} from "@/server/services/tickets";

export function ticketAccessToken(id: string) {
  if (!env.BETTER_AUTH_SECRET)
    throw new TicketError("Ticket access is not configured.");
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`guest-ticket-access:v1:${id}`)
    .digest("hex");
}
export function validTicketAccessToken(id: string, token: string) {
  return (
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(ticketAccessToken(id), "hex"),
    )
  );
}
export function ticketDocumentToken(id: string) {
  if (!env.BETTER_AUTH_SECRET)
    throw new TicketError("Ticket access is not configured.");
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`guest-ticket-document:v1:${id}`)
    .digest("hex");
}
export function validTicketDocumentToken(id: string, token: string) {
  return (
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(ticketDocumentToken(id), "hex"),
    )
  );
}
export async function setTicketSession(id: string, secret: string) {
  (await cookies()).set(`gbe_ticket_${id}`, secret, {
    httpOnly: true,
    secure: publicEnv.NEXT_PUBLIC_APP_URL.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
export async function requireTicketSession(id: string) {
  const token = (await cookies()).get(`gbe_ticket_${id}`)?.value;
  if (!token || token.length > 64)
    throw new TicketError(
      "Open the link in your ticket email or use the browser where you booked.",
    );
  const result = await getTicketBooking(id);
  if (
    !ticketSecretMatches(token, result.booking.accessHash) &&
    !validTicketAccessToken(id, token)
  )
    throw new TicketError("This booking link is not valid.");
  return result;
}
