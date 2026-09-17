import { parsePage } from "@/lib/domain/pagination";
import { OffsetPagination } from "@/components/shared/offset-pagination";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { nonDeletedApplications } from "@/server/dal/application-visibility";
import { applications, profiles, user } from "@/lib/db/schema";
import {
  setApplicantStatusAction,
  sendApplicantPasswordResetAction,
  resendApplicantInviteAction,
} from "@/server/actions/applicant-admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { search, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const pageSize = 50;
  const db = getDb();
  const where = and(
    eq(profiles.accountKind, "applicant"),
    search
      ? or(
          ilike(profiles.displayName, `%${search}%`),
          ilike(user.email, `%${search}%`),
        )
      : undefined,
  );
  const [total] = await db
    .select({ value: count() })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(where);
  const latestApplication = db
    .select()
    .from(applications)
    .where(nonDeletedApplications(eq(applications.ownerProfileId, profiles.id)))
    .orderBy(desc(applications.createdAt), desc(applications.id))
    .limit(1)
    .as("latest_application");
  const rows = await db
    .select({
      profile: profiles,
      email: user.email,
      application: {
        reference: latestApplication.reference,
        accountAccessStatus: latestApplication.accountAccessStatus,
      },
    })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .leftJoinLateral(latestApplication, sql`true`)
    .where(where)
    .orderBy(asc(profiles.displayName), asc(profiles.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return (
    <>
      <AdminPageHeader
        title={<>Applicants</>}
        description={
          <>
            Approved applicant profiles, linked nominations and account access
            controls.
          </>
        }
      />
      <form className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search name or email"
          className="h-11 flex-1 bg-white"
        />
        <Button className="h-11">Search</Button>
      </form>
      <div className="mt-6 flex flex-col gap-3">
        {rows.map(({ profile, email, application }) => (
          <article key={profile.id} className="surface rounded-lg p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link
                  href={`/admin/applicants/${profile.id}`}
                  className="font-medium hover:text-antique-gold hover:underline"
                >
                  {profile.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {email} · {application?.reference ?? "No linked application"}{" "}
                  ·{" "}
                  {application?.accountAccessStatus.replaceAll("_", " ") ??
                    "No access"}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${profile.isActive ? "status-success" : "status-error"}`}
              >
                {profile.isActive ? "Active" : "Suspended"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={resendApplicantInviteAction}>
                <input type="hidden" name="profileId" value={profile.id} />
                <Button size="sm" variant="outline">
                  Resend invitation
                </Button>
              </form>
              <form action={sendApplicantPasswordResetAction}>
                <input type="hidden" name="profileId" value={profile.id} />
                <Button size="sm" variant="outline">
                  Send password reset
                </Button>
              </form>
              <details>
                <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm">
                  {profile.isActive ? "Suspend" : "Reactivate"}
                </summary>
                <form
                  action={setApplicantStatusAction}
                  className="mt-2 flex max-w-md gap-2"
                >
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={profile.isActive ? "suspended" : "active"}
                  />
                  <Input
                    name="reason"
                    required
                    minLength={8}
                    placeholder="Mandatory reason"
                    className="h-9 bg-white"
                  />
                  <Button
                    size="sm"
                    variant={profile.isActive ? "destructive" : "default"}
                  >
                    Confirm
                  </Button>
                </form>
              </details>
            </div>
          </article>
        ))}
      </div>
      <OffsetPagination
        page={page}
        pageSize={pageSize}
        total={total.value}
        shown={rows.length}
        href={(next) =>
          `/admin/applicants?page=${next}${search ? `&search=${encodeURIComponent(search)}` : ""}`
        }
      />
    </>
  );
}
