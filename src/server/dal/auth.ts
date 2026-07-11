import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { profiles, staffMemberships } from "@/lib/db/schema";
export { hasPermission } from "@/lib/domain/permissions";

export async function requirePortalSession() {
  let session;
  try {
    session = await getAuth().api.getSession({ headers: await headers() });
  } catch {
    redirect("/login?reason=configuration");
  }
  if (!session) redirect("/login");
  const [profile] = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, session.user.id))
    .limit(1);
  if (!profile?.isActive) redirect("/login?reason=inactive");
  return { session, profile };
}
export async function requireStaff() {
  const base = await requirePortalSession();
  if (base.profile.accountKind !== "staff") redirect("/portal");
  const [membership] = await getDb()
    .select()
    .from(staffMemberships)
    .where(eq(staffMemberships.profileId, base.profile.id))
    .limit(1);
  if (!membership || membership.suspendedAt) redirect("/login?reason=inactive");
  if (membership.mfaRequired && !base.session.user.twoFactorEnabled)
    redirect("/auth/two-factor/setup");
  return { ...base, membership };
}
