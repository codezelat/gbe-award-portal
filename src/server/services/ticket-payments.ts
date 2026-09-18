import "server-only";
import { and, asc, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { TICKET_CHECKOUT_MS } from "@/lib/domain/ticket-timing";
import {
  auditLogs,
  guestTickets,
  ticketBookings,
  ticketPaymentAttempts,
} from "@/lib/db/schema";
import {
  assertGenieMatch,
  isGenieTerminalFailure,
  safeGenieCheckoutUrl,
  type GenieTransaction,
} from "@/lib/domain/genie";
import {
  createGenieTicketTransaction,
  GenieRequestRejected,
  getGenieTransaction,
  requireGenie,
} from "./genie-client";
import {
  expireTicketHolds,
  getTicketBooking,
  issueBookingTickets,
  lockTicketSale,
  TicketError,
  ticketInventory,
  type TicketBooking,
} from "./tickets";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";

export async function startTicketCheckout(bookingId: string) {
  requireGenie();
  const { booking } = await getTicketBooking(bookingId);
  const result = await getDb().transaction(async (tx) => {
    await lockTicketSale(tx, booking.salesId);
    const [current] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, bookingId))
      .for("update");
    if (current.status !== "pending" || current.source !== "public")
      throw new TicketError("This booking is no longer awaiting payment.");
    const [existing] = await tx
      .select()
      .from(ticketPaymentAttempts)
      .where(eq(ticketPaymentAttempts.bookingId, bookingId))
      .for("update");
    if (existing) return { attempt: existing, created: false };
    if (current.holdUntil <= new Date())
      throw new TicketError(
        "Your reservation expired. Please make a new booking.",
      );
    const [attempt] = await tx
      .insert(ticketPaymentAttempts)
      .values({
        bookingId,
        amountMinor: current.amountMinor,
        currency: current.currency,
        environment: env.GENIE_ENVIRONMENT,
        expiresAt: new Date(Date.now() + TICKET_CHECKOUT_MS),
      })
      .returning();
    return { attempt, created: true };
  });
  const { attempt } = result;
  if (!result.created) {
    if (attempt.checkoutUrl && attempt.active && attempt.expiresAt > new Date())
      return {
        url: safeGenieCheckoutUrl(attempt.checkoutUrl, attempt.environment),
      };
    throw new TicketError(
      "Check payment status before trying again. Do not make another payment if your card was charged.",
    );
  }
  let transaction: GenieTransaction;
  try {
    transaction = await createGenieTicketTransaction({ ...attempt, bookingId });
  } catch (error) {
    await getDb().transaction(async (tx) => {
      await lockTicketSale(tx, booking.salesId);
      await tx
        .select()
        .from(ticketBookings)
        .where(eq(ticketBookings.id, bookingId))
        .for("update");
      // A webhook can arrive before the create request returns or times out.
      const [locked] = await tx
        .select()
        .from(ticketPaymentAttempts)
        .where(eq(ticketPaymentAttempts.id, attempt.id))
        .for("update");
      if (locked.state !== "CREATING") return;
      const rejected = error instanceof GenieRequestRejected;
      await tx
        .update(ticketPaymentAttempts)
        .set({
          state: rejected ? "REJECTED" : "UNKNOWN",
          active: !rejected,
          updatedAt: new Date(),
        })
        .where(eq(ticketPaymentAttempts.id, attempt.id));
      if (rejected)
        await tx
          .update(ticketBookings)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(ticketBookings.id, bookingId));
    });
    throw new TicketError(
      error instanceof GenieRequestRejected
        ? "Card checkout is unavailable. Please try a new booking later."
        : "The payment provider has not responded. Check payment status before trying again.",
    );
  }
  assertGenieMatch(transaction, { ...attempt, appId: env.GENIE_APP_ID! });
  const url = transaction.url
    ? safeGenieCheckoutUrl(transaction.url, attempt.environment)
    : undefined;
  // Never settle on the create response; use an authenticated retrieval below.
  await getDb()
    .update(ticketPaymentAttempts)
    .set({
      transactionId: transaction.id,
      checkoutUrl: url,
      updatedAt: new Date(),
    })
    .where(eq(ticketPaymentAttempts.id, attempt.id));
  await reconcileTicketPayment(attempt.id);
  if (!url)
    throw new TicketError(
      "Checkout is being prepared. Check payment status shortly.",
    );
  return { url };
}

export async function reconcileTicketPayment(
  id: string,
  transactionId?: string,
  actorId?: string,
) {
  const [attempt] = await getDb()
    .select()
    .from(ticketPaymentAttempts)
    .where(eq(ticketPaymentAttempts.id, id))
    .limit(1);
  if (!attempt) throw new TicketError("Payment attempt not found.");
  if (attempt.environment !== env.GENIE_ENVIRONMENT)
    throw new TicketError(
      "This payment belongs to a different gateway environment.",
    );
  const remoteId = attempt.transactionId ?? transactionId;
  if (!remoteId)
    throw new TicketError(
      "Payment confirmation is still pending. Contact the GBE Awards team if your card was charged.",
    );
  const transaction = await getGenieTransaction(remoteId);
  assertGenieMatch(transaction, { ...attempt, appId: env.GENIE_APP_ID! });
  const { booking } = await getTicketBooking(attempt.bookingId);
  await getDb().transaction(async (tx) => {
    const sale = await lockTicketSale(tx, booking.salesId);
    const [current] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, booking.id))
      .for("update");
    const [locked] = await tx
      .select()
      .from(ticketPaymentAttempts)
      .where(eq(ticketPaymentAttempts.id, id))
      .for("update");
    assertGenieMatch(transaction, { ...locked, appId: env.GENIE_APP_ID! });
    // Confirmation is monotonic; a stale request cannot undo a settled/refunded booking.
    const refunded =
      transaction.state === "REFUNDED" ||
      (transaction.state === "VOIDED" && !!current.confirmedAt);
    const settled = ["paid", "refunded"].includes(current.status);
    if (
      current.status === "refunded" ||
      (settled && !refunded) ||
      (current.status === "review" &&
        !refunded &&
        transaction.state !== "CONFIRMED")
    ) {
      await tx
        .update(ticketPaymentAttempts)
        .set({ checkedAt: new Date() })
        .where(eq(ticketPaymentAttempts.id, id));
      return;
    }
    const confirmed = transaction.state === "CONFIRMED";
    const failed = isGenieTerminalFailure(transaction.state);
    await tx
      .update(ticketPaymentAttempts)
      .set({
        transactionId: transaction.id,
        state: transaction.state,
        active: !(confirmed || refunded || failed),
        checkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ticketPaymentAttempts.id, id));
    let status: TicketBooking["status"] = current.status;
    if (refunded) {
      status = "refunded";
      await tx
        .update(guestTickets)
        .set({ voidedAt: new Date() })
        .where(eq(guestTickets.bookingId, booking.id));
    } else if (confirmed) {
      const stock = await ticketInventory(tx, sale.id, current.id);
      // A late gateway settlement is retained for review if its released seats sold.
      status =
        stock.issued + stock.held + current.quantity <= sale.capacity
          ? "paid"
          : "review";
      if (status === "paid") await issueBookingTickets(tx, current);
    } else if (failed && current.status !== "review") status = "cancelled";
    await tx
      .update(ticketBookings)
      .set({
        status,
        confirmedAt: confirmed
          ? (current.confirmedAt ?? new Date())
          : current.confirmedAt,
        updatedAt: new Date(),
      })
      .where(eq(ticketBookings.id, booking.id));
    if (status !== current.status || (!attempt.transactionId && transactionId))
      await tx.insert(auditLogs).values({
        actorType: actorId ? "staff" : "system",
        actorProfileId: actorId,
        action: "ticket_payment.reconciled",
        entityType: "ticket_booking",
        entityId: booking.id,
        beforeRedacted: { status: current.status },
        afterRedacted: { status, gatewayState: transaction.state },
      });
  });
  scheduleEmailOutboxProcessing();
  return getTicketBooking(booking.id);
}

export async function checkTicketPayment(
  bookingId: string,
  transactionId?: string,
  actorId?: string,
) {
  const { attempt } = await getTicketBooking(bookingId);
  if (!attempt) {
    await expireTicketHolds();
    return getTicketBooking(bookingId);
  }
  return reconcileTicketPayment(attempt.id, transactionId, actorId);
}
export async function reconcilePendingTicketPayments() {
  const expired = await expireTicketHolds();
  const attempts = await getDb()
    .select({
      id: ticketPaymentAttempts.id,
      transactionId: ticketPaymentAttempts.transactionId,
    })
    .from(ticketPaymentAttempts)
    .where(
      and(
        eq(ticketPaymentAttempts.active, true),
        isNotNull(ticketPaymentAttempts.transactionId),
        lt(ticketPaymentAttempts.updatedAt, new Date(Date.now() - 60_000)),
      ),
    )
    .orderBy(asc(ticketPaymentAttempts.updatedAt))
    .limit(5);
  let checked = 0;
  let failed = 0;
  for (const attempt of attempts) {
    if (!attempt.transactionId) continue;
    try {
      await reconcileTicketPayment(attempt.id);
      checked++;
    } catch {
      failed++;
    }
  }
  return { expired: expired.length, checked, failed };
}
