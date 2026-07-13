import { AccountSecurity } from "@/components/forms/account-security";
import { requirePortalSession } from "@/server/dal/auth";

export default async function SecurityPage() {
  await requirePortalSession();
  return (
    <>
      <h1 className="page-heading">Security</h1>
      <p className="mt-2 text-graphite">
        Manage your password and active account sessions.
      </p>
      <div className="mt-7">
        <AccountSecurity />
      </div>
    </>
  );
}
