import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { nonDeletedApplications } from "@/server/dal/application-visibility";
import { applications, payments } from "@/lib/db/schema";
import { requirePortalSession } from "@/server/dal/auth";
import { AuthenticatedUpload } from "@/components/uploads/authenticated-upload";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
export default async function ReplacePayment({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { profile } = await requirePortalSession();
  const [row] = await getDb()
    .select({ application: applications, payment: payments })
    .from(applications)
    .innerJoin(payments, eq(payments.applicationId, applications.id))
    .where(
      nonDeletedApplications(
        eq(applications.id, applicationId),
        eq(applications.ownerProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!row) notFound();
  if (row.payment.status !== "rejected" || row.payment.method === "card") {
    return (
      <>
        <h1 className="page-heading">Payment</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          {row.application.reference}
        </p>
        <section className="surface mt-6 flex max-w-2xl flex-col items-start gap-5 rounded-xl p-5 sm:p-7">
          <StatusBadge status={row.payment.status} />
          {row.payment.amountMinor !== null ? (
            <p className="text-2xl font-semibold">
              {row.payment.currency ?? "LKR"}{" "}
              {(row.payment.amountMinor / 100).toLocaleString("en-LK")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {row.payment.status === "awaiting_payment" && row.payment.method ? (
              <Button
                className="h-11"
                render={<Link href={`/apply/payment/${applicationId}`} />}
              >
                Complete payment
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11"
              render={<Link href={`/portal/applications/${applicationId}`} />}
            >
              Back to nomination
            </Button>
          </div>
        </section>
      </>
    );
  }
  return (
    <>
      <h1 className="page-heading">Replace payment proof</h1>
      <p className="mt-2 max-w-2xl text-graphite">
        Upload one replacement for {row.application.reference}. The previous
        proof remains in the authorised history and will no longer be current.
      </p>
      <section className="surface mt-7 max-w-2xl rounded-lg p-6 md:p-8">
        <div className="mb-6 rounded-md bg-muted p-4 text-sm text-graphite">
          <strong>Reason:</strong>{" "}
          {row.payment.rejectedReason ??
            "The finance team could not verify the previous proof."}
        </div>
        <AuthenticatedUpload
          applicationId={applicationId}
          kind="payment_proof"
        />
      </section>
    </>
  );
}
