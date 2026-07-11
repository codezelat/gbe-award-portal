import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/shared/portal-shell";
import { requirePortalSession } from "@/server/dal/auth";
export const metadata: Metadata = {
  title: "Applicant portal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ApplicantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requirePortalSession();
  if (profile.accountKind !== "applicant") redirect("/admin");
  return (
    <PortalShell kind="portal" name={profile.displayName}>
      {children}
    </PortalShell>
  );
}
