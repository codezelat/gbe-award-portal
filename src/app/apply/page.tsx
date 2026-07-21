import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { NominationForm } from "@/components/forms/nomination-form";
import { ProgrammeDetailsButton } from "@/components/programme/programme-details-button";
import { brand } from "@/config/brand";
import { getOpenCycleCategories } from "@/server/dal/categories";
import { getPublicPaymentInstructions } from "@/server/dal/settings";

const description =
  "Submit a nomination for the Global Business Excellence Awards 2026 and showcase outstanding achievement, innovation and impact.";
const portalUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://access.gbeaward.com";

export const metadata: Metadata = {
  title: "Apply for the GBE Awards 2026",
  description,
  alternates: { canonical: "/apply" },
  openGraph: {
    title: "Apply for the GBE Awards 2026",
    description,
    url: "/apply",
    type: "website",
    images: [
      {
        url: "/brand/hero-award-2026.webp",
        width: 800,
        height: 1300,
        alt: "GBE Awards 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apply for the GBE Awards 2026",
    description,
    images: ["/brand/hero-award-2026.webp"],
  },
};
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const [{ categories, cycle, unavailable }, paymentInstructions] =
    await Promise.all([
      getOpenCycleCategories(),
      getPublicPaymentInstructions(),
    ]);
  const supportEmail = cycle?.supportEmail ?? "info@gbeaward.com";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${brand.officialSite}/#organization`,
        name: brand.name,
        url: brand.officialSite,
        logo: `${portalUrl}/brand/gbe-logo-full.png`,
        email: brand.supportEmail,
      },
      {
        "@type": "WebSite",
        "@id": `${portalUrl}/#website`,
        name: `${brand.shortName} nomination portal`,
        url: portalUrl,
        inLanguage: "en-GB",
        publisher: { "@id": `${brand.officialSite}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${portalUrl}/apply#webpage`,
        name: "Apply for the GBE Awards 2026",
        url: `${portalUrl}/apply`,
        description,
        isPartOf: { "@id": `${portalUrl}/#website` },
        about: { "@id": `${brand.officialSite}/#organization` },
        inLanguage: "en-GB",
      },
    ],
  };
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <section className="mx-auto max-w-[900px] px-5 pb-10 pt-12 md:pb-16 md:pt-18">
          <div className="mb-9 flex flex-col gap-6 border-b border-mist pb-9 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
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
            <div className="shrink-0 sm:pb-1">
              <ProgrammeDetailsButton />
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
