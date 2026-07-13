import { and, asc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { profiles, staffMemberships, user } from "@/lib/db/schema";
import {
  inviteStaffAction,
  updateStaffAction,
} from "@/server/actions/staff-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasPermission, requireStaff } from "@/server/dal/auth";

const roles = [
  "super_admin",
  "admin",
  "reviewer",
  "finance",
  "support",
] as const;
const pageSize = 30;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { search, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const { membership: currentMembership } = await requireStaff();
  if (!hasPermission(currentMembership, "staff.manage")) notFound();
  const rows = await getDb()
    .select({
      profile: profiles,
      membership: staffMemberships,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(staffMemberships)
    .innerJoin(profiles, eq(staffMemberships.profileId, profiles.id))
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(
      search
        ? and(
            eq(profiles.accountKind, "staff"),
            or(
              ilike(profiles.displayName, `%${search}%`),
              ilike(user.email, `%${search}%`),
            ),
          )
        : eq(profiles.accountKind, "staff"),
    )
    .orderBy(asc(profiles.displayName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const suffix = search ? `&search=${encodeURIComponent(search)}` : "";
  return (
    <>
      <h1 className="page-heading">Staff</h1>
      <p className="mt-2 text-graphite">
        Invitation-only staff access with explicit portal roles and mandatory
        MFA.
      </p>
      <form className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search staff name or email"
          className="h-11 flex-1 bg-white"
        />
        <Button>Search</Button>
      </form>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          {rows.map(({ profile, membership, email, twoFactorEnabled }) => (
            <form
              key={membership.id}
              action={updateStaffAction}
              className="surface flex flex-wrap items-center gap-4 rounded-lg p-5"
            >
              <input type="hidden" name="membershipId" value={membership.id} />
              <div className="min-w-56 flex-1">
                <p className="font-medium">{profile.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {email} · MFA {twoFactorEnabled ? "enabled" : "not enrolled"}
                </p>
              </div>
              <select
                name="role"
                defaultValue={membership.role}
                className="h-10 rounded-md border bg-white px-3 text-sm"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={membership.suspendedAt ? "suspended" : "active"}
                className="h-10 rounded-md border bg-white px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <Button size="sm" variant="outline">
                Save
              </Button>
            </form>
          ))}
          <nav
            className="mt-2 flex flex-wrap items-center justify-between gap-3"
            aria-label="Pagination"
          >
            <Button
              variant="outline"
              disabled={page === 1}
              render={
                page > 1 ? (
                  <a href={`/admin/staff?page=${page - 1}${suffix}`} />
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
                  <a href={`/admin/staff?page=${page + 1}${suffix}`} />
                ) : undefined
              }
            >
              Next
            </Button>
          </nav>
        </div>
        <section className="glass-feature h-fit rounded-lg p-5">
          <h2 className="text-lg font-semibold">Invite staff member</h2>
          <form action={inviteStaffAction} className="mt-4 flex flex-col gap-3">
            <Input
              name="name"
              required
              minLength={2}
              maxLength={180}
              placeholder="Full name"
              className="h-11 bg-white"
            />
            <Input
              name="email"
              type="email"
              required
              placeholder="Work email"
              className="h-11 bg-white"
            />
            <select
              name="role"
              className="h-11 rounded-md border bg-white px-3"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="canViewAllApplications" />
              Can view all applications
            </label>
            <Button>Send secure invitation</Button>
          </form>
        </section>
      </div>
    </>
  );
}
