import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { ticketBookingSchema } from "@/lib/domain/tickets";
import { reserveTickets, TicketError } from "@/server/services/tickets";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";
import { setTicketSession } from "@/server/security/ticket-session";
import { requireGenie } from "@/server/services/genie-client";
import {
  refreshExpiredTicketBookings,
  startTicketCheckout,
} from "@/server/services/ticket-payments";
import { verifyTicketDetails } from "@/server/security/ticket-details";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    requireGenie();
    const body = await request.text();
    if (body.length > 8192)
      return NextResponse.json(
        { message: "Request too large." },
        { status: 413 },
      );
    const raw = ticketBookingSchema
      .extend({
        turnstileToken: z.string().min(1).max(4096),
        detailsExpiresAt: z.number().int().positive(),
        detailsSignature: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(JSON.parse(body));
    if (
      !verifyTicketDetails(
        { ...raw, expiresAt: raw.detailsExpiresAt },
        raw.detailsSignature,
      )
    )
      throw new TicketError(
        "Your details session expired. Refresh availability to continue.",
      );
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const fingerprint = (value: string) =>
      createHmac("sha256", env.BETTER_AUTH_SECRET!)
        .update(`ticket-booking:${value}`)
        .digest("hex");
    await enforceRateLimit(`ticket-ip:${fingerprint(ip)}`, 10, 900);
    await enforceRateLimit(`ticket-email:${fingerprint(raw.email)}`, 5, 900);
    await verifyTurnstile(raw.turnstileToken, ip, "gbe_ticket_booking");
    await refreshExpiredTicketBookings(raw.salesId);
    const booking = await reserveTickets(raw);
    await setTicketSession(booking.id, raw.secret);
    const checkout = await startTicketCheckout(booking.id).catch(() => null);
    return NextResponse.json(
      { url: checkout?.url ?? `/tickets/booking/${booking.id}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof TicketError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues[0]?.message
              : "Booking could not be reserved. Please retry shortly.",
      },
      { status: 400 },
    );
  }
}
