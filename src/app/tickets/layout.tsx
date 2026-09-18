import type { Metadata } from "next";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
export const metadata: Metadata = {
  title: "Guest tickets",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader hideSignIn />
      <main
        id="main-content"
        className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14"
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
