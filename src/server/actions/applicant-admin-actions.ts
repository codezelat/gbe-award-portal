"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enforceRateLimit } from "@/server/security/rate-limit";
import {
  applications,
  auditLogs,
  emailOutbox,
  invitations,
  profiles,
  user,
} from "@/lib/db/schema";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function authorised() {
  const context = await requireStaff();
  if (!hasPermission(context.membership, "applicants.manage"))
    throw new Error("Applicant management permission is required.");
  return context;
}
export async function setApplicantStatusAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const input = z
    .object({
      profileId: z.uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().trim().min(8).max(1000),
    })
    .parse(Object.fromEntries(formData));
  await enforceRateLimit(`applicant-status:${actor.id}`, 30, 3600);
  const db = getDb();
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  if (!profile || profile.accountKind !== "applicant")
    throw new Error("Applicant not found.");
  if (input.status === "suspended")
    await getAuth().api.banUser({
      body: { userId: profile.authUserId, banReason: input.reason },
    });
  else await getAuth().api.unbanUser({ body: { userId: profile.authUserId } });
  const now = new Date();
  try { await db.transaction(async (tx) => {
    await tx.update(profiles).set({ isActive: input.status === "active", updatedAt: now }).where(eq(profiles.id, profile.id));
    await tx.update(applications).set({ accountAccessStatus: input.status === "active" ? "active" : "suspended", updatedAt: now }).where(input.status === "active" ? and(eq(applications.ownerProfileId, profile.id), eq(applications.accountAccessStatus, "suspended")) : eq(applications.ownerProfileId, profile.id));
    await tx.insert(auditLogs).values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: `applicant ${input.status}`,
      entityType: "profile",
      entityId: profile.id,
      reason: input.reason,
      afterRedacted: { isActive: input.status === "active" },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  }); } catch (error) {
    if (input.status === "suspended") await getAuth().api.unbanUser({ body: { userId: profile.authUserId } }).catch(() => undefined);
    else await getAuth().api.banUser({ body: { userId: profile.authUserId, banReason: "Restored after failed account reactivation" } }).catch(() => undefined);
    throw error;
  }
  revalidatePath("/admin/applicants");
}
export async function sendApplicantPasswordResetAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const profileId = z.uuid().parse(formData.get("profileId"));
  await enforceRateLimit(`password-reset-admin:${actor.id}:${profileId}`, 5, 3600);
  const [record] = await getDb()
    .select({ profile: profiles, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!record) throw new Error("Applicant not found.");
  await getAuth().api.requestPasswordReset({
    body: {
      email: record.email,
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/reset-password`,
    },
  });
  await getDb()
    .insert(auditLogs)
    .values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: "applicant password reset requested",
      entityType: "profile",
      entityId: profileId,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
}
export async function resendApplicantInviteAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const profileId = z.uuid().parse(formData.get("profileId"));
  await enforceRateLimit(`invitation-resend:${profileId}`, 5, 3600);
  const db = getDb();
  const [record] = await db
    .select({ profile: profiles, email: user.email, application: applications })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .innerJoin(applications, eq(applications.ownerProfileId, profiles.id))
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!record) throw new Error("Applicant or linked application not found.");
  await db.transaction(async (tx) => {
    await tx.update(invitations).set({ status: "revoked", updatedAt: new Date() }).where(
      and(
        eq(invitations.profileId, profileId),
        ne(invitations.status, "accepted"),
      ),
    );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const [invite] = await tx.insert(invitations).values({
      emailNormalised: record.email,
      applicationId: record.application.id,
      profileId,
      type: "applicant",
      status: "pending",
      tokenHash: hash(token),
      expiresAt,
      createdBy: actor.id,
    }).returning({ id: invitations.id });
    const url = new URL(
    "/auth/accept-invite",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
    url.searchParams.set("token", `${invite.id}.${token}`);
    await tx.insert(emailOutbox).values({
      templateKey: "applicant_invitation",
      recipientEmail: record.email,
      recipientProfileId: profileId,
      applicationId: record.application.id,
      payload: {
        name: record.profile.displayName,
        reference: record.application.reference,
        title: "Your GBE Awards portal invitation",
        message: "Your secure applicant invitation has been renewed.",
        url: url.toString(),
        expiresAt: expiresAt.toISOString(),
      },
      idempotencyKey: `applicant_invitation:${invite.id}:1`,
    });
    await tx.update(applications).set({ accountAccessStatus: "invited", updatedAt: new Date() }).where(eq(applications.id, record.application.id));
    await tx.insert(auditLogs).values({ actorProfileId: actor.id, actorType: "staff", action: "applicant invitation resent", entityType: "invitation", entityId: invite.id, applicationId: record.application.id, afterRedacted: { expiresAt: expiresAt.toISOString() }, metadataRedacted: {}, requestId: crypto.randomUUID() });
  });
  revalidatePath("/admin/applicants");
}
