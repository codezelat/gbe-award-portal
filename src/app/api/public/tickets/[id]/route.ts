import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/server/security/request";
import { requireTicketSession } from "@/server/security/ticket-session";
import { enforceRateLimit } from "@/server/security/rate-limit";
import {
  startTicketCheckout,
  checkTicketPayment,
} from "@/server/services/ticket-payments";
import { TicketError } from "@/server/services/tickets";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const id = z.uuid().parse((await context.params).id);
    await requireTicketSession(id);
    await enforceRateLimit(`ticket-action:${id}`, 30, 900);
    const body = await request.text();
    if (body.length > 1024) throw new TicketError("Request too large.");
    const { action } = z
      .object({ action: z.enum(["checkout", "check"]) })
      .parse(JSON.parse(body));
    if (action === "checkout")
      return NextResponse.json(await startTicketCheckout(id));
    await checkTicketPayment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof TicketError
            ? error.message
            : "Payment could not be checked. Please try again shortly.",
      },
      { status: 400 },
    );
  }
}
