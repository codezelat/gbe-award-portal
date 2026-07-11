"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { and, count, eq, ne } from "drizzle-orm";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  auditLogs,
  emailOutbox,
  invitations,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function assertManage(membership: { role: string; permissions: unknown }) {
  if (
    !hasPermission(membership, "staff.manage") &&
    membership.role !== "super_admin"
  )
    throw new Error("Staff management permission is required.");
}
export async function inviteStaffAction(formData: FormData) {
  const { profile: actor, membership } = await requireStaff();
  assertManage(membership);
  const input = z
    .object({
      name: z.string().trim().min(2).max(180),
      email: z.email().transform((value) => value.toLowerCase()),
      role: z.enum(["super_admin", "admin", "reviewer", "finance", "support"]),
      canViewAllApplications: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));
  if (input.role === "super_admin" && membership.role !== "super_admin")
    throw new Error(
      "Only a super administrator can invite another super administrator.",
    );
  const authRole = ["super_admin", "admin"].includes(input.role)
    ? "admin"
    : "user";
  const auth = getAuth();
  const created = await auth.api.createUser({
    body: {
      email: input.email,
      password: randomBytes(48).toString("base64url"),
      name: input.name,
      role: authRole,
    },
  });
  if (!created.user?.id)
    throw new Error("The staff account could not be created.");
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(profiles)
        .values({
          authUserId: created.user.id,
          accountKind: "staff",
          displayName: input.name,
          officialName: input.name,
          isActive: false,
        })
        .returning({ id: profiles.id });
      await tx.insert(staffMemberships).values({
        profileId: profile.id,
        role: input.role,
        canViewAllApplications: input.canViewAllApplications === "on",
        mfaRequired: true,
        createdBy: actor.id,
      });
      const [invite] = await tx
        .insert(invitations)
        .values({
          emailNormalised: input.email,
          profileId: profile.id,
          type: "staff",
          status: "pending",
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdBy: actor.id,
        })
        .returning({ id: invitations.id });
      const url = new URL(
        "/auth/accept-invite",
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      );
      url.searchParams.set("token", `${invite.id}.${token}`);
      await tx.insert(emailOutbox).values({
        templateKey: "staff_invitation",
        recipientEmail: input.email,
        recipientProfileId: profile.id,
        payload: {
          name: input.name,
          title: "GBE Awards staff invitation",
          message:
            "You have been invited to the GBE Awards administration portal. Staff multi-factor authentication is mandatory.",
          url: url.toString(),
        },
        idempotencyKey: `staff_invitation:${invite.id}:1`,
      });
      await tx.insert(auditLogs).values({
        actorProfileId: actor.id,
        actorType: "staff",
        action: "staff invited",
        entityType: "profile",
        entityId: profile.id,
        afterRedacted: { role: input.role, email: input.email },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
    });
  } catch (error) {
    await auth.api
      .removeUser({
        headers: await headers(),
        body: { userId: created.user.id },
      })
      .catch(() => undefined);
    throw error;
  }
  revalidatePath("/admin/staff");
}
export async function updateStaffAction(formData: FormData) {
  const { profile: actor, membership } = await requireStaff();
  assertManage(membership);
  const input = z
    .object({
      membershipId: z.uuid(),
      role: z.enum(["super_admin", "admin", "reviewer", "finance", "support"]),
      status: z.enum(["active", "suspended"]),
    })
    .parse(Object.fromEntries(formData));
  const db = getDb();
  const [before] = await db
    .select({ membership: staffMemberships, profile: profiles })
    .from(staffMemberships)
    .innerJoin(profiles, eq(staffMemberships.profileId, profiles.id))
    .where(eq(staffMemberships.id, input.membershipId))
    .limit(1);
  if (!before) throw new Error("Staff membership not found.");
  if (input.role === "super_admin" && membership.role !== "super_admin")
    throw new Error("Only a super administrator can grant that role.");
  if (
    before.membership.role === "super_admin" &&
    (input.role !== "super_admin" || input.status === "suspended")
  ) {
    const [remaining] = await db
      .select({ value: count() })
      .from(staffMemberships)
      .where(
        and(
          eq(staffMemberships.role, "super_admin"),
          ne(staffMemberships.id, input.membershipId),
        ),
      );
    if (!remaining.value)
      throw new Error(
        "The final active super administrator cannot be demoted or suspended.",
      );
  }
  const auth = getAuth();
  const requestHeaders = await headers();
  const oldAuthRole = ["super_admin", "admin"].includes(before.membership.role)
    ? "admin"
    : "user";
  await auth.api.setRole({
    headers: requestHeaders,
    body: {
      userId: before.profile.authUserId,
      role: ["super_admin", "admin"].includes(input.role) ? "admin" : "user",
    },
  });
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(staffMemberships)
        .set({
          role: input.role,
          suspendedAt: input.status === "suspended" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(staffMemberships.id, input.membershipId));
      await tx.insert(auditLogs).values({
        actorProfileId: actor.id,
        actorType: "staff",
        action: "staff membership updated",
        entityType: "staff_membership",
        entityId: before.membership.id,
        beforeRedacted: {
          role: before.membership.role,
          suspended: Boolean(before.membership.suspendedAt),
        },
        afterRedacted: {
          role: input.role,
          suspended: input.status === "suspended",
        },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
    });
  } catch (error) {
    await auth.api
      .setRole({
        headers: requestHeaders,
        body: { userId: before.profile.authUserId, role: oldAuthRole },
      })
      .catch(() => undefined);
    throw error;
  }
  if (input.status === "suspended")
    await auth.api.revokeUserSessions({
      headers: requestHeaders,
      body: { userId: before.profile.authUserId },
    });
  revalidatePath("/admin/staff");
}
