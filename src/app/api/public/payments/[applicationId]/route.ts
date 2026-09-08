import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { paymentAttempts, payments, applications } from "@/lib/db/schema";
import { requirePaymentSession } from "@/server/security/payment-session";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import {
  reconcileCardAttempt,
  startCardCheckout,
} from "@/server/services/card-payments";
import { z } from "zod";
import { paymentErrorMessage } from "@/lib/domain/genie";
import { cardCheckoutAmount, paymentDisplayAmount } from "@/lib/domain/card-checkout-amount";

export const runtime = "nodejs";
type Context = { params: Promise<{ applicationId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    await assertSameOrigin();
    const { applicationId } = await context.params;
    const { payment } = await requirePaymentSession(applicationId);
    const { action } = z
      .object({ action: z.enum(["status", "checkout", "bank_transfer"]) })
      .parse(await request.json());
    await enforceRateLimit(
      `public-payment:${applicationId}:${action}`,
      action === "status" ? 60 : 15,
      900,
    );
    if (action === "checkout")
      return NextResponse.json(
        { ok: true, data: await startCardCheckout(applicationId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    const db = getDb();
    const [attempt] = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.paymentId, payment.id))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);
    if (
      attempt?.transactionId &&
      attempt.active &&
      (!attempt.checkedAt || Date.now() - attempt.checkedAt.getTime() >= 10000)
    )
      await reconcileCardAttempt(attempt.id);
    if (action === "bank_transfer") {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, payment.id))
          .for("update");
        if (!["awaiting_payment", "rejected"].includes(current.status))
          throw new Error("This payment is already submitted or completed.");
        const [active] = await tx
          .select({ id: paymentAttempts.id })
          .from(paymentAttempts)
          .where(
            and(
              eq(paymentAttempts.paymentId, payment.id),
              eq(paymentAttempts.active, true),
            ),
          );
        if (active)
          throw new Error(
            "Your card checkout is still open. Wait for its 15-minute window to expire, then check status before using bank transfer.",
          );
        await tx
          .update(payments)
          .set({
            method: "bank_transfer",
            status: "awaiting_payment",
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
        await tx
          .update(applications)
          .set({ paymentStatus: "awaiting_payment", updatedAt: new Date() })
          .where(eq(applications.id, applicationId));
      });
    }
    const [current] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, payment.id));
    const [latest] = await db
      .select({
        state: paymentAttempts.state,
        active: paymentAttempts.active,
        expiresAt: paymentAttempts.expiresAt,
        amountMinor: paymentAttempts.amountMinor,
      })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.paymentId, payment.id))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);
    return NextResponse.json(
      {
        ok: true,
        data: {
          status: current.status,
          method: current.method,
          receipt: current.receiptReference,
          amountMinor: paymentDisplayAmount(current, latest?.active ? latest.amountMinor : null),
          cardAmountMinor: latest?.active ? latest.amountMinor : cardCheckoutAmount(current.expectedAmountMinor ?? 0, current.currency ?? "LKR"),
          attempt: latest ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: paymentErrorMessage(error) },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
