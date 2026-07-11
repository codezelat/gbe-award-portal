import type { Metadata } from "next";
import { Check, FileCheck2, Mail } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { NominationForm } from "@/components/forms/nomination-form";
import { getOpenCycleCategories } from "@/server/dal/categories";
import { getPublicPaymentInstructions } from "@/server/dal/settings";

export const metadata: Metadata = {
  title: "Apply for the GBE Awards 2026",
  alternates: { canonical: "/apply" },
};
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const [{ categories, cycle, unavailable }, paymentInstructions] =
    await Promise.all([
      getOpenCycleCategories(),
      getPublicPaymentInstructions(),
    ]);
  const supportEmail = cycle?.supportEmail ?? "info@gbeaward.com";
  return (
    <>
      <PublicHeader />
      <main id="main-content">
        <section className="mx-auto max-w-[900px] px-5 pb-10 pt-12 md:pb-16 md:pt-18">
          <div className="mb-9 grid gap-8 border-b border-mist pb-9 md:grid-cols-[1fr_250px] md:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-antique-gold">
                2026 nominations
              </p>
              <h1 className="page-heading max-w-2xl">
                {cycle?.heading ?? "GBE Awards Public Nomination"}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-graphite">
                {cycle?.introCopy ??
                  "The nomination window is currently unavailable. Please contact the GBE Awards team for guidance."}
              </p>
              <a
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-antique-gold underline-offset-4 hover:underline"
                href={`mailto:${supportEmail}`}
              >
                <Mail aria-hidden /> {supportEmail}
              </a>
            </div>
            <div className="border-l border-mist pl-5 text-sm text-graphite">
              <p className="font-semibold text-foreground">Before you begin</p>
              <ul className="mt-3 space-y-3">
                <li className="flex gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-antique-gold"
                    aria-hidden
                  />
                  Contact and nominee details
                </li>
                <li className="flex gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-antique-gold"
                    aria-hidden
                  />
                  Your award category
                </li>
                <li className="flex gap-2">
                  <FileCheck2
                    className="mt-0.5 size-4 shrink-0 text-antique-gold"
                    aria-hidden
                  />
                  One payment-proof file
                </li>
              </ul>
            </div>
          </div>
          <NominationForm
            categories={categories}
            unavailable={unavailable}
            feeMinor={cycle?.nominationFeeMinor ?? undefined}
            currency={cycle?.currency ?? undefined}
            paymentInstructions={paymentInstructions ?? undefined}
          />
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Your nomination is reviewed before portal access is issued. Times
            are shown in Asia/Colombo.
          </p>
        </section>
      </main>
    </>
  );
}
