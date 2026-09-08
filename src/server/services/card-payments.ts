import "server-only";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  applications,
  auditLogs,
  awardCycles,
  cycleSequences,
  paymentAttempts,
  payments,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  assertGenieMatch,
  isGenieTerminalFailure,
  safeGenieCheckoutUrl,
  genieConfirmedAt,
} from "@/lib/domain/genie";
import {
  createGenieTransaction,
  getGenieTransaction,
  requireGenie,
  GenieRequestRejected,
} from "./genie-client";

export async function reconcileCardAttempt(
  id: string,
  discoveredTransactionId?: string,
) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, id))
    .limit(1);
  if (!attempt) throw new Error("Payment attempt not found.");
  if (attempt.environment !== env.GENIE_ENVIRONMENT)
    throw new Error("This payment belongs to a different payment environment.");
  const transactionId = attempt.transactionId ?? discoveredTransactionId;
  if (!transactionId) return;
  // The webhook is only a notification. All financial decisions use this authenticated lookup.
  const remote = await getGenieTransaction(transactionId);
  assertGenieMatch(remote, { ...attempt, appId: env.GENIE_APP_ID! });
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, attempt.paymentId))
      .for("update");
    if (!payment) throw new Error("Payment record not found.");
    const [current] = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, id))
      .for("update");
    if (
      !current ||
      (current.transactionId && current.transactionId !== remote.id)
    )
      throw new Error("Payment transaction changed.");
    // A delayed pending response must never undo a previously confirmed payment.
    if (
      ["CONFIRMED", "REFUNDED", "VOIDED"].includes(current.state) &&
      !["CONFIRMED", "REFUNDED", "VOIDED"].includes(remote.state)
    )
      return;
    if (
      ["REFUNDED", "VOIDED"].includes(current.state) &&
      remote.state === "CONFIRMED"
    )
      return;
    const now = new Date();
    await tx
      .update(paymentAttempts)
      .set({
        transactionId: remote.id,
        state: remote.state,
        active:
          !["CONFIRMED", "REFUNDED"].includes(remote.state) &&
          !isGenieTerminalFailure(remote.state),
        checkedAt: now,
        updatedAt: now,
      })
      .where(eq(paymentAttempts.id, id));
    if (remote.state !== "CONFIRMED") {
      // Refunds are recorded only for the transaction that actually settled this payment.
      if (
        ["REFUNDED", "VOIDED"].includes(remote.state) &&
        payment.gatewayTransactionId === remote.id &&
        payment.status === "verified"
      ) {
        await tx
          .update(payments)
          .set({ status: "refunded", updatedAt: now })
          .where(eq(payments.id, payment.id));
        await tx
          .update(applications)
          .set({ paymentStatus: "refunded", updatedAt: now })
          .where(eq(applications.id, payment.applicationId));
        await tx.insert(auditLogs).values({
          actorType: "system",
          action: "gateway payment reversed",
          entityType: "payment",
          entityId: payment.id,
          applicationId: payment.applicationId,
          metadataRedacted: { attemptId: id, state: remote.state },
          requestId: crypto.randomUUID(),
        });
      }
      return;
    }
    if (payment.gatewayTransactionId === remote.id) return;
    if (
      ["verified", "waived", "refunded"].includes(payment.status) ||
      payment.gatewayTransactionId
    ) {
      if (current.state === "CONFIRMED") return;
      await tx.insert(auditLogs).values({
        actorType: "system",
        action: "additional gateway payment requires review",
        entityType: "payment",
        entityId: payment.id,
        applicationId: payment.applicationId,
        metadataRedacted: { attemptId: id },
        requestId: crypto.randomUUID(),
      });
      return;
    }
    const [application] = await tx
      .select({ cycleId: applications.cycleId, year: awardCycles.year })
      .from(applications)
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(eq(applications.id, payment.applicationId));
    await tx
      .insert(cycleSequences)
      .values({ cycleId: application.cycleId, nextReceiptNumber: 2 })
      .onConflictDoUpdate({
        target: cycleSequences.cycleId,
        set: {
          nextReceiptNumber: sql`${cycleSequences.nextReceiptNumber}+1`,
          updatedAt: now,
        },
      });
    const [sequence] = await tx
      .select()
      .from(cycleSequences)
      .where(eq(cycleSequences.cycleId, application.cycleId));
    const receiptReference =
      payment.receiptReference ??
      `RCT-${application.year}-${String(sequence.nextReceiptNumber - 1).padStart(6, "0")}`;
    await tx
      .update(payments)
      .set({
        method: "card",
        status: "verified",
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        gatewayTransactionId: remote.id,
        bankReference: remote.id,
        paidAt: genieConfirmedAt(remote, now),
        verifiedAt: now,
        verifiedBy: null,
        receiptReference,
        rejectedReason: null,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));
    await tx
      .update(applications)
      .set({ paymentStatus: "verified", updatedAt: now, lastActivityAt: now })
      .where(eq(applications.id, payment.applicationId));
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "card payment verified by Genie",
      entityType: "payment",
      entityId: payment.id,
      applicationId: payment.applicationId,
      afterRedacted: { status: "verified" },
      metadataRedacted: {
        attemptId: id,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
      },
      requestId: crypto.randomUUID(),
    });
  });
}

export async function startCardCheckout(applicationId: string) {
  requireGenie();
  const db = getDb();
  const reserved = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.applicationId, applicationId))
      .for("update");
    if (
      !payment ||
      !payment.method ||
      !payment.expectedAmountMinor ||
      !payment.currency
    )
      throw new Error("This nomination is not eligible for online checkout.");
    if (payment.status === "verified") return { settled: true } as const;
    if (!["awaiting_payment", "rejected"].includes(payment.status))
      throw new Error(
        "This payment is already being reviewed or has been completed.",
      );
    const [active] = await tx
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.paymentId, payment.id),
          eq(paymentAttempts.active, true),
        ),
      );
    if (active) return { attempt: active, created: false } as const;
    const [application] = await tx
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), isNull(applications.deletedAt)),
      );
    if (
      !application?.submittedAt ||
      ![
        "submitted",
        "under_review",
        "changes_requested",
        "resubmitted",
        "approved",
      ].includes(application.workflowStatus)
    )
      throw new Error("Payment is not available for this nomination.");
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        paymentId: payment.id,
        environment: env.GENIE_ENVIRONMENT,
        amountMinor: payment.expectedAmountMinor,
        currency: payment.currency,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      })
      .returning();
    await tx
      .update(payments)
      .set({
        method: "card",
        status: "awaiting_payment",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
    await tx
      .update(applications)
      .set({ paymentStatus: "awaiting_payment", updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    return { attempt, created: true } as const;
  });
  if ("settled" in reserved) return { settled: true };
  const { attempt } = reserved;
  if (!reserved.created) {
    if (attempt.environment !== env.GENIE_ENVIRONMENT)
      throw new Error(
        "An earlier checkout needs review. Please contact support.",
      );
    if (attempt.transactionId) await reconcileCardAttempt(attempt.id);
    const [current] = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attempt.id));
    if (current.state === "CONFIRMED") return { settled: true };
    if (!current.active)
      throw new Error(
        "That checkout has ended. You can now try again or choose bank transfer.",
      );
    if (!current.checkoutUrl || current.expiresAt <= new Date())
      throw new Error(
        "Payment confirmation is still pending. Check status before trying again or contact support.",
      );
    return {
      url: safeGenieCheckoutUrl(current.checkoutUrl, current.environment),
    };
  }
  try {
    const remote = await createGenieTransaction({ ...attempt, applicationId });
    assertGenieMatch(remote, { ...attempt, appId: env.GENIE_APP_ID! });
    const url = safeGenieCheckoutUrl(remote.url ?? "", attempt.environment);
    await db
      .update(paymentAttempts)
      .set({
        transactionId: remote.id,
        checkoutUrl: url,
        updatedAt: new Date(),
      })
      .where(eq(paymentAttempts.id, attempt.id));
    return { url };
  } catch (error) {
    if (error instanceof GenieRequestRejected) {
      await db
        .update(paymentAttempts)
        .set({ state: "REJECTED", active: false, updatedAt: new Date() })
        .where(
          and(
            eq(paymentAttempts.id, attempt.id),
            isNull(paymentAttempts.transactionId),
          ),
        );
      throw error;
    }
    // A timeout may happen AFTER Genie creates the transaction. Never create another automatically.
    await db
      .update(paymentAttempts)
      .set({ state: "UNKNOWN", updatedAt: new Date() })
      .where(
        and(
          eq(paymentAttempts.id, attempt.id),
          isNull(paymentAttempts.transactionId),
        ),
      );
    throw new Error(
      "Checkout could not be confirmed. Please check payment status or contact support before paying again.",
    );
  }
}

export async function reconcilePendingCardPayments() {
  if (env.GENIE_ENABLED !== "true") return { checked: 0, failed: 0 };
  const rows = await getDb()
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.active, true),
        eq(paymentAttempts.environment, env.GENIE_ENVIRONMENT),
        lt(paymentAttempts.updatedAt, new Date(Date.now() - 60_000)),
      ),
    )
    .orderBy(asc(paymentAttempts.updatedAt))
    .limit(5);
  let failed = 0;
  for (const row of rows) {
    try {
      if (row.transactionId) await reconcileCardAttempt(row.id);
      else failed++;
    } catch {
      failed++;
    }
  }
  return { checked: rows.length, failed };
}
