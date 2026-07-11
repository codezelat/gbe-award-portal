import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { applications, invitations, profiles, user } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  revokeApplicantInviteAction,
  revokeApplicantSessionsAction,
  resendApplicantInviteAction,
  sendApplicantPasswordResetAction,
  updateApplicantProfileAction,
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
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<a href={`/admin/applicants/${profileId}/view`} />}
        >
          View applicant experience
        </Button>
      </div>
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
          <div className="mt-5 grid gap-3 border-t pt-5">
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Revoke active sessions
              </summary>
              <form
                action={revokeApplicantSessionsAction}
                className="mt-3 flex gap-2"
              >
                <input type="hidden" name="profileId" value={profileId} />
                <Input
                  name="reason"
                  required
                  minLength={8}
                  placeholder="Mandatory security reason"
                  className="h-9 bg-white"
                />
                <Button size="sm" variant="destructive">
                  Revoke
                </Button>
              </form>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Revoke unaccepted invitation
              </summary>
              <form
                action={revokeApplicantInviteAction}
                className="mt-3 flex gap-2"
              >
                <input type="hidden" name="profileId" value={profileId} />
                <Input
                  name="reason"
                  required
                  minLength={8}
                  placeholder="Mandatory revocation reason"
                  className="h-9 bg-white"
                />
                <Button size="sm" variant="destructive">
                  Revoke invitation
                </Button>
              </form>
            </details>
          </div>
        </section>
      </div>
      <details className="surface mt-6 rounded-lg p-6">
        <summary className="cursor-pointer text-lg font-semibold">
          Correct applicant profile
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Login email and official application fields remain locked. Every
          correction below is audited with its reason.
        </p>
        <form
          action={updateApplicantProfileAction}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="profileId" value={profileId} />
          {[
            ["displayName", "Display name", record.profile.displayName],
            ["designation", "Designation", record.profile.designation],
            [
              "industrySector",
              "Industry / sector",
              record.profile.industrySector,
            ],
            ["phoneDisplay", "Telephone", record.profile.phoneDisplay],
            [
              "alternateEmail",
              "Alternate email",
              record.profile.alternateEmail,
            ],
            [
              "businessWebsite",
              "Business website",
              record.profile.businessWebsite,
            ],
            ["city", "City", record.profile.city],
            ["region", "Region", record.profile.region],
            ["countryCode", "Country code", record.profile.countryCode],
          ].map(([name, label, value]) => (
            <label
              key={name}
              className="flex flex-col gap-2 text-sm font-medium"
            >
              {label}
              <Input
                name={String(name)}
                defaultValue={value ?? ""}
                required={name === "displayName"}
                className="h-11 bg-white"
              />
            </label>
          ))}
          <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
            Short biography / organisation profile
            <Textarea
              name="shortBio"
              defaultValue={record.profile.shortBio ?? ""}
              maxLength={1000}
              className="min-h-32 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
            Mandatory correction reason
            <Textarea
              name="reason"
              required
              minLength={8}
              className="bg-white"
            />
          </label>
          <Button className="md:col-span-2">
            Save audited profile correction
          </Button>
        </form>
      </details>
    </>
  );
}
