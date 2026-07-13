import type { Metadata } from "next";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { getPublicSetting } from "@/server/dal/settings";

const description =
  "Read the privacy notice for the GBE Awards nomination portal.";

export const metadata: Metadata = {
  title: "Privacy notice",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy notice", description, url: "/privacy" },
};
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const content = await getPublicSetting("privacy_notice");
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 md:py-20"
      >
        <h1 className="page-heading">Privacy notice</h1>
        <section className="surface mt-7 rounded-lg p-6 md:p-9">
          <div className="whitespace-pre-wrap text-[15px] leading-7 text-graphite">
            {content ??
              "The approved portal privacy notice is not currently published. Applications cannot be opened until this content is configured. Contact info@gbeaward.com for privacy, access or correction requests."}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
