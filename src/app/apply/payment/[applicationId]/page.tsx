import type { Metadata } from "next";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { NominationPayment } from "@/components/forms/nomination-payment";
import { requirePaymentSession } from "@/server/security/payment-session";
import { getPublicPaymentInstructions } from "@/server/dal/settings";
import { genieAvailable } from "@/server/services/genie-client";
import { getDb } from "@/lib/db";
import { paymentAttempts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Nomination payment",
  robots: { index: false, follow: false },
};
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const row = await requirePaymentSession(applicationId).catch(() => null);
  const instructions = row ? await getPublicPaymentInstructions() : null;
  const [attempt] = row
    ? await getDb()
        .select({
          state: paymentAttempts.state,
          active: paymentAttempts.active,
          expiresAt: paymentAttempts.expiresAt,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.paymentId, row.payment.id))
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(1)
    : [];
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader compactSignIn />
      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-10"
      >
        {row ? (
          <NominationPayment
            applicationId={applicationId}
            reference={row.application.reference!}
            amountMinor={row.payment.expectedAmountMinor ?? 0}
            currency={row.payment.currency ?? "LKR"}
            initial={{
              status: row.payment.status,
              method: row.payment.method,
              receipt: row.payment.receiptReference,
              attempt: attempt
                ? { ...attempt, expiresAt: attempt.expiresAt.toISOString() }
                : null,
            }}
            bank={instructions?.bankTransfer}
            cardEnabled={genieAvailable()}
          />
        ) : (
          <section className="surface rounded-xl p-6">
            <h1 className="page-heading">Payment session unavailable</h1>
            <p className="mt-4 text-sm">
              Open this page in the browser you used to submit your nomination.
              If your session has expired,{" "}
              <a className="underline" href="mailto:info@gbeaward.com">
                contact the GBE Awards team
              </a>{" "}
              with your reference before submitting again.
            </p>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
