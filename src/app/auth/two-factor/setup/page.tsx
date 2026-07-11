import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppLogo } from "@/components/brand/app-logo";
import { TwoFactorSetup } from "@/components/forms/two-factor-setup";
import { requirePortalSession } from "@/server/dal/auth";
export const metadata: Metadata = {
  title: "Set up staff MFA",
  robots: { index: false, follow: false },
};
export default async function SetupMfa() {
  const { session, profile } = await requirePortalSession();
  if (profile.accountKind !== "staff") redirect("/portal");
  if (session.user.twoFactorEnabled) redirect("/admin");
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center px-5 py-10"
    >
      <section className="glass-feature w-full max-w-lg rounded-2xl p-7 md:p-10">
        <AppLogo className="mb-9" />
        <h1 className="font-display text-4xl font-semibold">
          Secure staff access
        </h1>
        <p className="mb-7 mt-3 leading-7 text-graphite">
          Multi-factor authentication is mandatory before production
          administration data can be opened.
        </p>
        <TwoFactorSetup />
      </section>
    </main>
  );
}
