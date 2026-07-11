import type { Metadata } from "next";
import { PublicHeader } from "@/components/shared/public-header";
import { getPublicSetting } from "@/server/dal/settings";
export const metadata: Metadata = {
  title: "Nomination terms",
  alternates: { canonical: "/terms" },
};
export const dynamic = "force-dynamic";
export default async function Terms() {
  const content = await getPublicSetting("legal_terms");
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <h1 className="page-heading">Nomination terms</h1>
        <section className="surface mt-7 rounded-lg p-6 md:p-9">
          <div className="whitespace-pre-wrap text-[15px] leading-7 text-graphite">
            {content ??
              "The approved nomination terms are not currently published. Applications cannot be opened until this content is configured. Contact info@gbeaward.com for assistance."}
          </div>
        </section>
      </main>
    </>
  );
}
