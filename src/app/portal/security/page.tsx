import { AccountSecurity } from "@/components/forms/account-security";
import { requirePortalSession } from "@/server/dal/auth";
import { getFeatureFlags } from "@/server/services/feature-flags";

export default async function SecurityPage() {
  const [{ session }, flags] = await Promise.all([
    requirePortalSession(),
    getFeatureFlags(),
  ]);
  return (
    <>
      <h1 className="page-heading">Security</h1>
      <p className="mt-2 text-graphite">
        Manage your password and active account sessions.
      </p>
      <div className="mt-7">
        <AccountSecurity
          showMfa={flags.applicant_mfa_enabled}
          mfaEnabled={Boolean(session.user.twoFactorEnabled)}
        />
      </div>
    </>
  );
}
