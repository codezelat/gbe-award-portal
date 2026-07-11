import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { NominationForm } from "@/components/forms/nomination-form";
import { getOpenCycleCategories } from "@/server/dal/categories";

export const metadata: Metadata = {
  title: "Apply for the GBE Awards 2026",
  alternates: { canonical: "/apply" },
};
export default async function ApplyPage() {
  const { categories, cycle, unavailable } = await getOpenCycleCategories();
  const supportEmail = cycle?.supportEmail ?? "info@gbeaward.com";
  return (
    <>
      <PublicHeader />
      <main id="main-content">
        <section className="mx-auto max-w-[900px] px-5 pb-10 pt-14 md:pb-16 md:pt-20">
          <div className="glass-feature mb-8 rounded-xl px-6 py-9 md:px-12 md:py-12">
            <h1 className="page-heading max-w-2xl">
              {cycle?.heading ?? "GBE Awards Public Nomination"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-graphite">
              {cycle?.introCopy ??
                "The nomination window is currently unavailable. Please contact the GBE Awards team for guidance."}
            </p>
            <a
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-antique-gold underline-offset-4 hover:underline"
              href={`mailto:${supportEmail}`}
            >
              <Mail aria-hidden /> For support, contact {supportEmail}
            </a>
          </div>
          <NominationForm categories={categories} unavailable={unavailable} />
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Your nomination is reviewed before any portal account is created.
            All times are managed in Asia/Colombo.
          </p>
        </section>
      </main>
    </>
  );
}
