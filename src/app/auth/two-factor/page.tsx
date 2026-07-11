import type { Metadata } from "next";
import { AppLogo } from "@/components/brand/app-logo";
import { TwoFactorChallenge } from "@/components/forms/two-factor-challenge";
export const metadata: Metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false },
};
export default function TwoFactorPage() {
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center px-5 py-10"
    >
      <section className="glass-feature w-full max-w-md rounded-2xl p-7 md:p-10">
        <AppLogo className="mb-9" />
        <h1 className="font-display text-4xl font-semibold">
          Verify secure access
        </h1>
        <p className="mb-7 mt-3 leading-7 text-graphite">
          Enter the current six-digit code from your staff authenticator app.
        </p>
        <TwoFactorChallenge />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Lost access? Contact info@gbeaward.com through an approved channel.
        </p>
      </section>
    </main>
  );
}
