import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
export const metadata: Metadata = {
  title: "Portal help",
  alternates: { canonical: "/help" },
};
export default function Help() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <h1 className="page-heading">Portal help</h1>
        <p className="mt-4 max-w-2xl leading-7 text-graphite">
          Assistance with nominations, invitation access and approved applicant
          accounts.
        </p>
        <a
          href="mailto:info@gbeaward.com"
          className="ceremonial-button mt-8 flex min-h-12 items-center justify-center gap-2 rounded-md px-5 font-semibold"
        >
          <Mail />
          Contact info@gbeaward.com
        </a>
        <a
          href="https://wa.link/10p065"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-md border border-antique-gold/40 px-5 font-semibold text-antique-gold transition-colors hover:bg-gold-wash"
        >
          <MessageCircle />
          Contact us on WhatsApp
        </a>
      </main>
    </>
  );
}
