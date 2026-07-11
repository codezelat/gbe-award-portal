import type { Metadata } from "next";
import { AppLogo } from "@/components/brand/app-logo";
import { ForgotPasswordForm } from "@/components/forms/password-recovery";
export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};
export default function ForgotPassword() {
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center px-5 py-10"
    >
      <section className="glass-feature w-full max-w-md rounded-2xl p-7 md:p-10">
        <AppLogo className="mb-9" />
        <h1 className="font-display text-4xl font-semibold">
          Reset your password
        </h1>
        <p className="mb-7 mt-3 leading-7 text-graphite">
          Enter the email address associated with your invitation-only account.
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
