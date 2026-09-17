import { parsePage } from "@/lib/domain/pagination";
import { OffsetPagination } from "@/components/shared/offset-pagination";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { and, asc, count, eq, ilike, or } from "drizzle-orm";
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

const roles = ["staff", "super_admin"] as const;
const pageSize = 30;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { search, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const { membership: currentMembership } = await requireStaff();
  if (!hasPermission(currentMembership, "staff.manage")) notFound();
  const where = and(
    eq(profiles.accountKind, "staff"),
    search
      ? or(
          ilike(profiles.displayName, `%${search}%`),
          ilike(user.email, `%${search}%`),
        )
      : undefined,
  );
  const [total] = await getDb()
    .select({ value: count() })
    .from(staffMemberships)
    .innerJoin(profiles, eq(staffMemberships.profileId, profiles.id))
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(where);
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
    .where(where)
    .orderBy(asc(profiles.displayName), asc(profiles.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return (
    <>
      <AdminPageHeader
        title={<>Staff</>}
        description={<>Manage staff access and invitations. MFA is required.</>}
      />
      <form className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search staff name or email"
          className="h-11 flex-1 bg-white"
        />
        <Button className="h-11">Search</Button>
      </form>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
                defaultValue={
                  membership.role === "super_admin" ? "super_admin" : "staff"
                }
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
          <OffsetPagination
            page={page}
            pageSize={pageSize}
            total={total.value}
            shown={rows.length}
            href={(next) =>
              `/admin/staff?page=${next}${search ? `&search=${encodeURIComponent(search)}` : ""}`
            }
          />
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
            <Button>Send secure invitation</Button>
          </form>
        </section>
      </div>
    </>
  );
}
