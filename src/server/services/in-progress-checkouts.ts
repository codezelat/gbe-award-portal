import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  auditLogs,
  paymentAttempts,
  payments,
} from "@/lib/db/schema";
import { pendingCardPayment } from "@/server/dal/application-visibility";

export const checkoutRemovalAction = "unpaid checkout removed from in-progress";

export async function removeUnpaidCheckout(id: string, actorProfileId: string) {
  await getDb().transaction(async (tx) => {
    // Settlement and proof submission lock payment first. Keep this order everywhere.
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.applicationId, id))
      .for("update");
    const [application] = await tx
      .select({
        id: applications.id,
        deletedAt: applications.deletedAt,
        submittedAt: applications.submittedAt,
        workflowStatus: applications.workflowStatus,
        pending: pendingCardPayment(),
      })
      .from(applications)
      .where(eq(applications.id, id))
      .for("update");
    if (!application) throw new Error("This record no longer exists.");
    if (application.deletedAt) return;
    const [proof] = await tx
      .select({ id: applicationFiles.id })
      .from(applicationFiles)
      .where(
        and(
          eq(applicationFiles.applicationId, id),
          eq(applicationFiles.kind, "payment_proof"),
        ),
      )
      .limit(1);
    const [settledAttempt] = payment
      ? await tx
          .select({ id: paymentAttempts.id })
          .from(paymentAttempts)
          .where(
            and(
              eq(paymentAttempts.paymentId, payment.id),
              inArray(paymentAttempts.state, [
                "CONFIRMED",
                "REFUNDED",
                "VOIDED",
              ]),
            ),
          )
          .limit(1)
      : [];
    if (
      !payment ||
      !application.pending ||
      !application.submittedAt ||
      application.workflowStatus !== "submitted" ||
      payment.proofApplicationFileId ||
      payment.verifiedAt ||
      payment.paidAt ||
      payment.receiptReference ||
      payment.gatewayTransactionId ||
      proof ||
      settledAttempt
    )
      throw new Error(
        "This nomination has payment or submission evidence. Refresh the list before continuing.",
      );
    const now = new Date();
    await tx
      .update(applications)
      .set({ deletedAt: now, deletedBy: actorProfileId, updatedAt: now })
      .where(eq(applications.id, id));
    // Retain attempts and evidence: an already-open gateway checkout may still settle.
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId,
      applicationId: id,
      action: checkoutRemovalAction,
      entityType: "application",
      entityId: id,
      afterRedacted: { deletedAt: now.toISOString() },
      requestId: crypto.randomUUID(),
    });
  });
}
