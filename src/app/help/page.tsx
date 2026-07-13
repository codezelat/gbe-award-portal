import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";

const description =
  "Get help with GBE Awards nominations, invitation access and approved applicant accounts.";

export const metadata: Metadata = {
  title: "Portal help",
  description,
  alternates: { canonical: "/help" },
  openGraph: { title: "Portal help", description, url: "/help" },
};
export default function Help() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 md:py-20"
      >
        <h1 className="page-heading">Portal help</h1>
        <p className="mt-4 max-w-2xl leading-7 text-graphite">
          Assistance with nominations, invitation access and approved applicant
          accounts.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="mailto:info@gbeaward.com"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-semibold text-background shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#302f29] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-antique-gold focus-visible:ring-offset-2"
          >
            <Mail aria-hidden />
            Contact info@gbeaward.com
          </a>
          <a
            href="https://wa.link/10p065"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#208b5a] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#176f47] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#208b5a] focus-visible:ring-offset-2"
          >
            <MessageCircle className="fill-white/15" aria-hidden />
            Contact us on WhatsApp
          </a>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
