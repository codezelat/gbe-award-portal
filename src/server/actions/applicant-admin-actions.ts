"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
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
  scheduleEmailOutboxProcessing();
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
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ isActive: input.status === "active", updatedAt: now })
        .where(eq(profiles.id, profile.id));
      await tx
        .update(applications)
        .set({
          accountAccessStatus:
            input.status === "active" ? "active" : "suspended",
          updatedAt: now,
        })
        .where(
          input.status === "active"
            ? and(
                eq(applications.ownerProfileId, profile.id),
                eq(applications.accountAccessStatus, "suspended"),
              )
            : eq(applications.ownerProfileId, profile.id),
        );
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
    });
  } catch (error) {
    if (input.status === "suspended")
      await getAuth()
        .api.unbanUser({ body: { userId: profile.authUserId } })
        .catch(() => undefined);
    else
      await getAuth()
        .api.banUser({
          body: {
            userId: profile.authUserId,
            banReason: "Restored after failed account reactivation",
          },
        })
        .catch(() => undefined);
    throw error;
  }
  revalidatePath("/admin/applicants");
}
export async function sendApplicantPasswordResetAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile: actor } = await authorised();
  const profileId = z.uuid().parse(formData.get("profileId"));
  await enforceRateLimit(
    `password-reset-admin:${actor.id}:${profileId}`,
    5,
    3600,
  );
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
  await getDb().insert(auditLogs).values({
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
  scheduleEmailOutboxProcessing();
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
    await tx
      .update(invitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(invitations.profileId, profileId),
          ne(invitations.status, "accepted"),
        ),
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const [invite] = await tx
      .insert(invitations)
      .values({
        emailNormalised: record.email,
        applicationId: record.application.id,
        profileId,
        type: "applicant",
        status: "pending",
        tokenHash: hash(token),
        expiresAt,
        createdBy: actor.id,
      })
      .returning({ id: invitations.id });
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
    await tx
      .update(applications)
      .set({ accountAccessStatus: "invited", updatedAt: new Date() })
      .where(eq(applications.id, record.application.id));
    await tx.insert(auditLogs).values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: "applicant invitation resent",
      entityType: "invitation",
      entityId: invite.id,
      applicationId: record.application.id,
      afterRedacted: { expiresAt: expiresAt.toISOString() },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/applicants");
}

export async function updateApplicantProfileAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const input = z
    .object({
      profileId: z.uuid(),
      displayName: z.string().trim().min(2).max(180),
      designation: z.string().trim().max(160).optional(),
      industrySector: z.string().trim().max(160).optional(),
      phoneDisplay: z.string().trim().max(40).optional(),
      alternateEmail: z.union([z.literal(""), z.email()]).optional(),
      businessWebsite: z.union([z.literal(""), z.url()]).optional(),
      city: z.string().trim().max(120).optional(),
      region: z.string().trim().max(120).optional(),
      countryCode: z.union([z.literal(""), z.string().length(2)]).optional(),
      shortBio: z.string().trim().max(1000).optional(),
      reason: z.string().trim().min(8).max(1000),
    })
    .parse(Object.fromEntries(formData));
  const db = getDb();
  const [before] = await db
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.id, input.profileId),
        eq(profiles.accountKind, "applicant"),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Applicant not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        displayName: input.displayName,
        designation: input.designation || null,
        industrySector: input.industrySector || null,
        phoneDisplay: input.phoneDisplay || null,
        alternateEmail: input.alternateEmail || null,
        businessWebsite: input.businessWebsite || null,
        city: input.city || null,
        region: input.region || null,
        countryCode: input.countryCode || null,
        shortBio: input.shortBio || null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, before.id));
    await tx.insert(auditLogs).values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: "applicant profile corrected",
      entityType: "profile",
      entityId: before.id,
      beforeRedacted: {
        displayName: before.displayName,
        designation: before.designation,
        industrySector: before.industrySector,
        phoneDisplay: before.phoneDisplay,
        alternateEmail: before.alternateEmail,
        businessWebsite: before.businessWebsite,
        city: before.city,
        region: before.region,
        countryCode: before.countryCode,
      },
      afterRedacted: {
        displayName: input.displayName,
        designation: input.designation || null,
        industrySector: input.industrySector || null,
        phoneDisplay: input.phoneDisplay || null,
        alternateEmail: input.alternateEmail || null,
        businessWebsite: input.businessWebsite || null,
        city: input.city || null,
        region: input.region || null,
        countryCode: input.countryCode || null,
      },
      reason: input.reason,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath(`/admin/applicants/${before.id}`);
}

export async function revokeApplicantSessionsAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const profileId = z.uuid().parse(formData.get("profileId"));
  const reason = z
    .string()
    .trim()
    .min(8)
    .max(1000)
    .parse(formData.get("reason"));
  const [record] = await getDb()
    .select({ authUserId: profiles.authUserId })
    .from(profiles)
    .where(
      and(eq(profiles.id, profileId), eq(profiles.accountKind, "applicant")),
    )
    .limit(1);
  if (!record) throw new Error("Applicant not found.");
  await getAuth().api.revokeUserSessions({
    headers: await headers(),
    body: { userId: record.authUserId },
  });
  await getDb().insert(auditLogs).values({
    actorProfileId: actor.id,
    actorType: "staff",
    action: "applicant sessions revoked",
    entityType: "profile",
    entityId: profileId,
    reason,
    metadataRedacted: {},
    requestId: crypto.randomUUID(),
  });
}

export async function revokeApplicantInviteAction(formData: FormData) {
  const { profile: actor } = await authorised();
  const profileId = z.uuid().parse(formData.get("profileId"));
  const reason = z
    .string()
    .trim()
    .min(8)
    .max(1000)
    .parse(formData.get("reason"));
  const db = getDb();
  await db.transaction(async (tx) => {
    const revoked = await tx
      .update(invitations)
      .set({ status: "revoked", tokenHash: null, updatedAt: new Date() })
      .where(
        and(
          eq(invitations.profileId, profileId),
          ne(invitations.status, "accepted"),
        ),
      )
      .returning({
        id: invitations.id,
        applicationId: invitations.applicationId,
      });
    if (!revoked.length) throw new Error("No active invitation was found.");
    await tx
      .update(applications)
      .set({ accountAccessStatus: "revoked", updatedAt: new Date() })
      .where(eq(applications.ownerProfileId, profileId));
    await tx.insert(auditLogs).values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: "applicant invitation revoked",
      entityType: "profile",
      entityId: profileId,
      reason,
      afterRedacted: { invitationsRevoked: revoked.length },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath(`/admin/applicants/${profileId}`);
}

export async function reassignApplicationOwnerAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile: actor, membership } = await authorised();
  if (membership.role !== "super_admin")
    throw new Error("Super-administrator permission is required.");
  const input = z
    .object({
      applicationId: z.uuid(),
      applicantEmail: z.email().transform((value) => value.toLowerCase()),
      reason: z.string().trim().min(12).max(1000),
      reauthPassword: z.string().min(1).max(128),
    })
    .parse(Object.fromEntries(formData));
  const requestHeaders = await headers();
  await getAuth().api.verifyPassword({
    headers: requestHeaders,
    body: { password: input.reauthPassword },
  });
  const db = getDb();
  const [target] = await db
    .select({ profile: profiles, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(
      and(
        eq(profiles.accountKind, "applicant"),
        eq(user.email, input.applicantEmail),
      ),
    )
    .limit(1);
  if (!target?.profile.isActive)
    throw new Error(
      "An active applicant account with that email was not found.",
    );
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ ownerProfileId: applications.ownerProfileId })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!before) throw new Error("Application not found.");
    if (before.ownerProfileId === target.profile.id) return;
    const [previousOwner] = before.ownerProfileId
      ? await tx
          .select({ profile: profiles, email: user.email })
          .from(profiles)
          .innerJoin(user, eq(profiles.authUserId, user.id))
          .where(eq(profiles.id, before.ownerProfileId))
          .limit(1)
      : [];
    await tx
      .update(applications)
      .set({
        ownerProfileId: target.profile.id,
        accountAccessStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(applications.id, input.applicationId));
    await tx.insert(auditLogs).values({
      actorProfileId: actor.id,
      actorType: "staff",
      action: "application applicant account reassigned",
      entityType: "application",
      entityId: input.applicationId,
      applicationId: input.applicationId,
      beforeRedacted: { ownerProfileId: before.ownerProfileId },
      afterRedacted: { ownerProfileId: target.profile.id },
      reason: input.reason,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
    await tx.insert(emailOutbox).values({
      templateKey: "account_application_linked",
      recipientEmail: target.email,
      recipientProfileId: target.profile.id,
      applicationId: input.applicationId,
      payload: {
        name: target.profile.displayName,
        message:
          "An approved GBE Awards nomination has been linked to your portal account.",
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/applications/${input.applicationId}`,
      },
      idempotencyKey: `application_reassigned:${input.applicationId}:${before.ownerProfileId ?? "none"}:${target.profile.id}`,
    });
    if (previousOwner)
      await tx.insert(emailOutbox).values({
        templateKey: "account_security_change",
        recipientEmail: previousOwner.email,
        recipientProfileId: previousOwner.profile.id,
        applicationId: input.applicationId,
        payload: {
          name: previousOwner.profile.displayName,
          message:
            "A GBE Awards nomination was removed from your portal account by an authorised administrator. Contact info@gbeaward.com if this was unexpected.",
        },
        idempotencyKey: `application_unlinked:${input.applicationId}:${previousOwner.profile.id}:${target.profile.id}`,
      });
  });
  revalidatePath(`/admin/applications/${input.applicationId}`);
}
