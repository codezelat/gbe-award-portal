import { z } from "zod";
import {
  requireTicketSession,
  validTicketDocumentToken,
} from "@/server/security/ticket-session";
import { getTicketBooking } from "@/server/services/tickets";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { buildGuestTicketPdf } from "@/server/services/ticket-document";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await context.params).id);
    const token = new URL(request.url).searchParams.get("token");
    // Resend fetches the private attachment server-to-server; no browser cookie is available.
    const { booking } =
      token && validTicketDocumentToken(id, token)
        ? await getTicketBooking(id)
        : await requireTicketSession(id);
    await enforceRateLimit(`ticket-download:${id}`, 20, 900);
    const pdf = await buildGuestTicketPdf(id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${booking.reference}-tickets.pdf"`,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json(
      {
        message:
          "Tickets are unavailable. Open the link in your booking email and try again.",
      },
      { status: 403 },
    );
  }
}
