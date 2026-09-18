import { eq } from "drizzle-orm";
import { z } from "zod";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { ticketPaymentAttempts } from "@/lib/db/schema";
import { verifyGenieSignature } from "@/lib/domain/genie";
import { reconcileTicketPayment } from "@/server/services/ticket-payments";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !env.GENIE_API_KEY ||
    !verifyGenieSignature(request.headers, env.GENIE_API_KEY)
  )
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 32768)
      return NextResponse.json({ ok: false }, { status: 413 });
    const input = z
      .object({
        eventType: z.string(),
        transactionId: z.string().regex(/^[a-f0-9]{24}$/i),
        localId: z.string().nullish(),
      })
      .safeParse(JSON.parse(body));
    if (!input.success)
      return NextResponse.json({ ok: false }, { status: 400 });
    if (input.data.eventType !== "NOTIFY_TRANSACTION_CHANGE")
      return NextResponse.json({ ok: true });
    const id = z.uuid().safeParse(input.data.localId);
    const [attempt] = await getDb()
      .select({ id: ticketPaymentAttempts.id })
      .from(ticketPaymentAttempts)
      .where(
        id.success
          ? eq(ticketPaymentAttempts.id, id.data)
          : eq(ticketPaymentAttempts.transactionId, input.data.transactionId),
      )
      .limit(1);
    if (!attempt) return NextResponse.json({ ok: true });
    await enforceRateLimit(`ticket-webhook:${attempt.id}`, 100, 900);
    await reconcileTicketPayment(attempt.id, input.data.transactionId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
