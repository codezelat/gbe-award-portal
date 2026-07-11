import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Banknote, FileText } from "lucide-react";
import { requirePortalSession } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import { applications, payments } from "@/lib/db/schema";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
export default async function PaymentPage() {
  const { profile } = await requirePortalSession();
  const [row] = await getDb()
    .select({ application: applications, payment: payments })
    .from(applications)
    .innerJoin(payments, eq(payments.applicationId, applications.id))
    .where(eq(applications.ownerProfileId, profile.id))
    .orderBy(desc(applications.lastActivityAt))
    .limit(1);
  if (!row)
    return (
      <>
        <h1 className="page-heading">Payment</h1>
        <p className="mt-6 text-muted-foreground">
          No linked payment record is available. Contact info@gbeaward.com.
        </p>
      </>
    );
  const rejected = row.payment.status === "rejected";
  return (
    <>
      <h1 className="page-heading">Payment</h1>
      <p className="mt-2 text-graphite">
        Manual payment-proof verification for {row.application.reference}.
      </p>
      <section
        className={`glass-feature mt-7 rounded-xl p-6 md:p-9 ${rejected ? "border-[#ebcfc5]" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Banknote className="text-antique-gold" />
            <h2 className="mt-4 font-display text-3xl font-semibold">
              {rejected ? "Replacement proof required" : "Payment proof status"}
            </h2>
            <div className="mt-3">
              <StatusBadge status={row.payment.status} />
            </div>
            <p className="mt-4 max-w-2xl leading-7 text-graphite">
              {rejected
                ? (row.payment.rejectedReason ??
                  "The submitted proof could not be verified. Contact the team before uploading a replacement.")
                : "The finance team reviews payment evidence manually. Any required action will be shown here and sent by email."}
            </p>
          </div>
          {rejected ? (
            <Button
              className="h-12"
              render={
                <Link
                  href={`/portal/applications/${row.application.id}/payment`}
                />
              }
            >
              Replace payment proof
            </Button>
          ) : null}
        </div>
        {row.payment.bankReference ? (
          <div className="mt-7 border-t pt-5 text-sm">
            <p>
              <span className="text-muted-foreground">Bank reference:</span>{" "}
              {row.payment.bankReference}
            </p>
          </div>
        ) : null}
      </section>
      <section className="surface mt-6 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <FileText className="text-antique-gold" />
          <div>
            <h2 className="font-semibold">Payment evidence remains private</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Proof files are accessible only through short-lived authorised
              links and are never published.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
