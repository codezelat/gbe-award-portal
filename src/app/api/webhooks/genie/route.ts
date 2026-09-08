import { eq } from "drizzle-orm";
import { z } from "zod";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { paymentAttempts } from "@/lib/db/schema";
import { verifyGenieSignature } from "@/lib/domain/genie";
import { reconcileCardAttempt } from "@/server/services/card-payments";
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
        localId: z.string().nullable().optional(),
      })
      .safeParse(JSON.parse(body));
    if (!input.success)
      return NextResponse.json({ ok: false }, { status: 400 });
    if (input.data.eventType !== "NOTIFY_TRANSACTION_CHANGE")
      return NextResponse.json({ ok: true });
    const attemptId = z.uuid().safeParse(input.data.localId);
    const [attempt] = await getDb()
      .select()
      .from(paymentAttempts)
      .where(
        attemptId.success
          ? eq(paymentAttempts.id, attemptId.data)
          : eq(paymentAttempts.transactionId, input.data.transactionId),
      )
      .limit(1);
    if (!attempt) return NextResponse.json({ ok: true });
    await enforceRateLimit(`genie-webhook:${attempt.id}`, 100, 900);
    await reconcileCardAttempt(attempt.id, input.data.transactionId);
    return NextResponse.json({ ok: true });
  } catch {
    // Return a retryable response; do not acknowledge a failed database/API reconciliation.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
