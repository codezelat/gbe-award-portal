import { and, asc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
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
  const page = Math.max(
    1,
    Math.min(10_000, Number.parseInt(pageParam ?? "1", 10) || 1),
  );
  const pageSize = 50;
  const db = getDb();
  const rows = await db
    .select({ profile: profiles, email: user.email, application: applications })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .leftJoin(applications, eq(applications.ownerProfileId, profiles.id))
    .where(
      and(
        eq(profiles.accountKind, "applicant"),
        search
          ? or(
              ilike(profiles.displayName, `%${search}%`),
              ilike(user.email, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(profiles.displayName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return (
    <>
      <h1 className="page-heading">Applicants</h1>
      <p className="mt-2 text-graphite">
        Approved applicant profiles, linked nominations and account access
        controls.
      </p>
      <form className="mt-6 flex max-w-xl gap-3">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search name or email"
          className="h-11 bg-white"
        />
        <Button>Search</Button>
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
      <nav
        className="mt-5 flex items-center justify-between"
        aria-label="Pagination"
      >
        <Button
          variant="outline"
          disabled={page === 1}
          render={
            page > 1 ? (
              <a
                href={`/admin/applicants?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              />
            ) : undefined
          }
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button
          variant="outline"
          disabled={rows.length < pageSize}
          render={
            rows.length === pageSize ? (
              <a
                href={`/admin/applicants?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              />
            ) : undefined
          }
        >
          Next
        </Button>
      </nav>
    </>
  );
}
