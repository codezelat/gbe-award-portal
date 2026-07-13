import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
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
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-[900px] px-5 pb-10 pt-12 md:pb-16 md:pt-18">
          <div className="mb-9 border-b border-mist pb-9">
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
          </div>
          <NominationForm
            categories={categories}
            unavailable={unavailable}
            feeMinor={cycle?.nominationFeeMinor ?? undefined}
            currency={cycle?.currency ?? undefined}
            paymentInstructions={paymentInstructions ?? undefined}
          />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
