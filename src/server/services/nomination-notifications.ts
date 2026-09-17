import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications, emailOutbox, payments } from "@/lib/db/schema";
import { env, publicEnv } from "@/lib/env";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

// Payment callbacks and browser retries share the same outbox keys. Historical
// notifications are not resent when an existing checkout is completed later.
export async function queueNominationReceived(
  tx: Transaction,
  applicationId: string,
) {
  const [row] = await tx
    .select({ application: applications, payment: payments })
    .from(applications)
    .innerJoin(payments, eq(payments.applicationId, applications.id))
    .where(eq(applications.id, applicationId));
  if (
    !row ||
    row.application.deletedAt ||
    !row.application.reference ||
    !row.application.submittedAt
  )
    return;
  const submittedAt = row.application.submittedAt;
  const { application, payment } = row;
  await tx
    .insert(emailOutbox)
    .values([
      {
        templateKey: "nomination_received",
        recipientEmail: application.emailNormalised,
        applicationId,
        payload: {
          reference: application.reference,
          paymentReference: payment.paymentReference,
          nomineeName: application.nomineeName,
        },
        idempotencyKey: `nomination_received:${applicationId}:1`,
      },
      {
        templateKey: "admin_nomination_received",
        recipientEmail: env.SUPPORT_EMAIL ?? "info@gbeaward.com",
        applicationId,
        payload: {
          title: "New GBE Awards nomination",
          reference: application.reference,
          nomineeName: application.nomineeName,
          categoryName: application.categoryNameSnapshot,
          awardNomination: application.awardNomination,
          submittedAt: submittedAt.toISOString(),
          url: `${publicEnv.NEXT_PUBLIC_APP_URL}/admin/applications/${applicationId}`,
        },
        idempotencyKey: `admin_nomination_received:${applicationId}:1`,
      },
    ])
    .onConflictDoNothing({ target: emailOutbox.idempotencyKey });
}
