import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PublicHeader } from "@/components/shared/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Nomination received",
  robots: { index: false, follow: false },
};

export default function SubmittedPage() {
  return (
    <>
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-5 py-16"
      >
        <section className="glass-feature w-full rounded-xl p-8 text-center md:p-12">
          <CheckCircle2 className="mx-auto size-12 text-emerald-700" />
          <h1 className="page-heading mt-6">Nomination received</h1>
          <p className="mt-4 leading-7 text-graphite">
            Thank you. Keep the reference shown on your confirmation screen and
            acknowledgement email. The GBE Awards team will review the
            nomination before any portal account is created.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button render={<Link href="/apply" />}>
              Return to nomination page
            </Button>
            <Button
              variant="outline"
              render={<a href="mailto:info@gbeaward.com" />}
            >
              Contact support
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
