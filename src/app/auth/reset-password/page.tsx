import type { Metadata } from "next";
import { AppLogo } from "@/components/brand/app-logo";
import { ResetPasswordForm } from "@/components/forms/password-recovery";
export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center px-5 py-10"
    >
      <section className="glass-feature w-full max-w-md rounded-2xl p-7 md:p-10">
        <AppLogo className="mb-9" />
        <h1 className="font-display text-4xl font-semibold">
          Choose a new password
        </h1>
        <p className="mb-7 mt-3 leading-7 text-graphite">
          Use at least 12 characters and a password manager where possible.
        </p>
        {token && !error ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="rounded-md bg-muted p-4 text-sm">
            This reset link is invalid, expired or already used.{" "}
            <a
              href="/auth/forgot-password"
              className="text-antique-gold underline"
            >
              Request another link
            </a>
            .
          </p>
        )}
      </section>
    </main>
  );
}
