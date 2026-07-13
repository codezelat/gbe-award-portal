"use server";
import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { activatableInvitationStatuses } from "@/lib/domain/invitations";
import {
  applications,
  account,
  auditLogs,
  invitations,
  profiles,
  user,
} from "@/lib/db/schema";
import { enforceRateLimit } from "@/server/security/rate-limit";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function acceptInvitationAction(formData: FormData) {
  const input = z
    .object({
      token: z.string().min(20),
      password: z.string().min(12).max(128),
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    })
    .parse(Object.fromEntries(formData));
  const [inviteId, rawToken] = input.token.split(".");
  if (!inviteId || !rawToken)
    throw new Error("This invitation is invalid or expired.");
  await enforceRateLimit(`invitation-accept:${inviteId}`, 10, 3600);
  const db = getDb();
  const [invite] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, inviteId),
        inArray(invitations.status, activatableInvitationStatuses),
      ),
    )
    .limit(1);
  if (
    !invite ||
    invite.tokenHash !== hash(rawToken) ||
    invite.expiresAt < new Date()
  )
    throw new Error("This invitation is invalid, expired or already used.");
  if (
    !invite.profileId ||
    (invite.type === "applicant" && !invite.applicationId)
  )
    throw new Error("This invitation is incomplete. Contact support.");
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, invite.profileId))
    .limit(1);
  if (!profile) throw new Error("Applicant profile not found.");
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  await db.transaction(async (tx) => {
    const accepted = await tx
      .update(invitations)
      .set({
        status: "accepted",
        acceptedAt: now,
        tokenHash: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(invitations.id, invite.id),
          inArray(invitations.status, activatableInvitationStatuses),
        ),
      )
      .returning({ id: invitations.id });
    if (!accepted.length) throw new Error("This invitation was already used.");
    const credential = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: now })
      .where(
        and(
          eq(account.userId, profile.authUserId),
          eq(account.providerId, "credential"),
        ),
      )
      .returning({ id: account.id });
    if (!credential.length)
      throw new Error("This invitation is incomplete. Contact support.");
    await tx
      .update(user)
      .set({ emailVerified: true, updatedAt: now })
      .where(eq(user.id, profile.authUserId));
    await tx
      .update(profiles)
      .set({ isActive: true, updatedAt: now })
      .where(eq(profiles.id, profile.id));
    if (invite.applicationId)
      await tx
        .update(applications)
        .set({
          accountAccessStatus: "active",
          updatedAt: now,
          lastActivityAt: now,
        })
        .where(eq(applications.id, invite.applicationId));
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: profile.accountKind,
      action: "invitation accepted",
      entityType: "invitation",
      entityId: invite.id,
      applicationId: invite.applicationId,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  redirect("/login?activated=true");
}
