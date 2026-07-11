import type { Metadata } from "next";
import { cookies } from "next/headers";
import { desc } from "drizzle-orm";
import { PortalShell } from "@/components/shared/portal-shell";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import { awardCycles } from "@/lib/db/schema";
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, membership } = await requireStaff();
  const cycles = await getDb()
    .select({ id: awardCycles.id, name: awardCycles.name })
    .from(awardCycles)
    .orderBy(desc(awardCycles.year));
  const cookieCycle = (await cookies()).get("gbe_admin_cycle")?.value;
  const selectedCycleId = cycles.some((cycle) => cycle.id === cookieCycle)
    ? cookieCycle!
    : cycles[0]?.id;
  const rules: Record<string, string> = {
    "/admin/applications": "applications.view",
    "/admin/applicants": "applicants.manage",
    "/admin/payments": "payments.view",
    "/admin/files": "files.view",
    "/admin/communications": "applications.view_all",
    "/admin/exports": "exports.create",
    "/admin/reports": "applications.view_all",
    "/admin/categories": "configuration.manage",
    "/admin/cycles": "configuration.manage",
    "/admin/staff": "staff.manage",
    "/admin/settings": "settings.manage",
    "/admin/activity": "audit.view",
  };
  const allowedAdminHrefs = [
    "/admin",
    ...Object.entries(rules)
      .filter(
        ([href, permission]) =>
          hasPermission(membership, permission) &&
          (href !== "/admin/communications" ||
            hasPermission(membership, "messages.send")),
      )
      .map(([href]) => href),
  ];
  return (
    <PortalShell
      kind="admin"
      name={profile.displayName}
      role={membership.role}
      allowedAdminHrefs={allowedAdminHrefs}
      cycleOptions={cycles}
      selectedCycleId={selectedCycleId}
    >
      {children}
    </PortalShell>
  );
}
