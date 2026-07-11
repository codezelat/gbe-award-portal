import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { applications, invitations, profiles, user } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  resendApplicantInviteAction,
  sendApplicantPasswordResetAction,
} from "@/server/actions/applicant-admin-actions";

export default async function ApplicantDetail({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "applicants.manage")) notFound();
  const db = getDb();
  const [record] = await db
    .select({ profile: profiles, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(
      and(eq(profiles.id, profileId), eq(profiles.accountKind, "applicant")),
    )
    .limit(1);
  if (!record) notFound();
  const [linked, invites] = await Promise.all([
    db
      .select()
      .from(applications)
      .where(eq(applications.ownerProfileId, profileId)),
    db.select().from(invitations).where(eq(invitations.profileId, profileId)),
  ]);
  return (
    <>
      <h1 className="page-heading">{record.profile.displayName}</h1>
      <p className="mt-2 text-graphite">
        {record.email} · {record.profile.isActive ? "Active" : "Suspended"}
      </p>
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <section className="surface rounded-lg p-6">
          <h2 className="section-title">Linked applications</h2>
          <div className="mt-4 flex flex-col gap-3">
            {linked.map((item) => (
              <a
                key={item.id}
                href={`/admin/applications/${item.id}`}
                className="rounded-md border p-4 transition-colors hover:border-antique-gold"
              >
                <span className="font-mono text-xs text-antique-gold">
                  {item.reference}
                </span>
                <span className="mt-2 flex items-center justify-between gap-3">
                  <strong>{item.nomineeName}</strong>
                  <StatusBadge status={item.workflowStatus} />
                </span>
              </a>
            ))}
          </div>
        </section>
        <section className="surface rounded-lg p-6">
          <h2 className="section-title">Account access</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {invites.length} invitation record(s), including accepted and
            expired history.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={resendApplicantInviteAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <Button variant="outline">Resend invitation</Button>
            </form>
            <form action={sendApplicantPasswordResetAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <Button variant="outline">Send password reset</Button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
