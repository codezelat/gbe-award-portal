import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applications,
  auditLogs,
  emailOutbox,
  invitations,
  profiles,
  user,
} from "@/lib/db/schema";

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createOrRefreshApplicantInvitation(
  applicationId: string,
  actorProfileId: string,
) {
  const db = getDb();
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!application || application.workflowStatus !== "approved")
    throw new Error("Only an approved application can receive portal access.");
  if (application.ownerProfileId) {
    const [owner] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, application.ownerProfileId))
      .limit(1);
    if (!owner || owner.accountKind !== "applicant" || !owner.isActive)
      throw new Error(
        "The linked applicant account is unavailable and must be reviewed.",
      );
    await db.transaction(async (tx) => {
      await tx
        .update(applications)
        .set({ accountAccessStatus: "active", updatedAt: new Date() })
        .where(eq(applications.id, applicationId));
      await tx
        .insert(emailOutbox)
        .values({
          templateKey: "existing_account_linked",
          recipientEmail: application.emailNormalised,
          recipientProfileId: owner.id,
          applicationId,
          payload: {
            name: owner.displayName,
            title: "A nomination was linked to your GBE Awards portal",
            message:
              "An approved nomination has been securely linked to your existing portal account.",
            url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/applications/${applicationId}`,
          },
          idempotencyKey: `existing_account_linked:${applicationId}:${owner.id}`,
        })
        .onConflictDoNothing();
      await tx.insert(auditLogs).values({
        actorProfileId,
        actorType: "staff",
        action: "approved application linked to existing account",
        entityType: "application",
        entityId: applicationId,
        applicationId,
        afterRedacted: { ownerProfileId: owner.id },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
    });
    return { linked: true };
  }
  const [existingProfile] = await db
    .select({ profile: profiles })
    .from(profiles)
    .innerJoin(user, eq(profiles.authUserId, user.id))
    .where(eq(user.email, application.emailNormalised))
    .limit(1);
  if (existingProfile?.profile) {
    if (existingProfile.profile.accountKind !== "applicant")
      throw new Error(
        "This email belongs to a staff account. A super administrator must resolve the identity conflict.",
      );
    if (!existingProfile.profile.isActive)
      throw new Error(
        "The existing applicant account is suspended and cannot be linked until reactivated.",
      );
    await db.transaction(async (tx) => {
      await tx
        .update(applications)
        .set({
          ownerProfileId: existingProfile.profile.id,
          accountAccessStatus: "active",
          updatedAt: new Date(),
        })
        .where(eq(applications.id, applicationId));
      await tx
        .insert(emailOutbox)
        .values({
          templateKey: "existing_account_linked",
          recipientEmail: application.emailNormalised,
          recipientProfileId: existingProfile.profile.id,
          applicationId,
          payload: {
            name: existingProfile.profile.displayName,
            title: "A nomination was linked to your GBE Awards portal",
            message:
              "An approved nomination has been securely linked to your existing portal account.",
            url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/applications/${applicationId}`,
          },
          idempotencyKey: `existing_account_linked:${applicationId}:${existingProfile.profile.id}`,
        })
        .onConflictDoNothing();
      await tx.insert(auditLogs).values({
        actorProfileId,
        actorType: "staff",
        action: "approved application linked to existing account",
        entityType: "application",
        entityId: applicationId,
        applicationId,
        afterRedacted: { ownerProfileId: existingProfile.profile.id },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
    });
    return { linked: true };
  }
  const password = randomBytes(48).toString("base64url");
  const auth = getAuth();
  const created = await auth.api.createUser({
    body: {
      email: application.emailNormalised,
      password,
      name: application.nomineeName,
      role: "user",
    },
  });
  if (!created?.user?.id)
    throw new Error("The applicant account could not be created.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  try {
    const result = await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(profiles)
        .values({
          authUserId: created.user.id,
          accountKind: "applicant",
          displayName: application.nomineeName,
          officialName: application.nomineeName,
          designation: application.designation,
          industrySector: application.industrySector,
          phoneE164: application.phoneE164,
          phoneDisplay: application.phoneDisplay,
          businessWebsite: application.businessWebsite,
          isActive: false,
        })
        .returning({ id: profiles.id });
      await tx
        .update(applications)
        .set({
          ownerProfileId: profile.id,
          accountAccessStatus: "pending_invite",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.id, applicationId),
            eq(applications.workflowStatus, "approved"),
          ),
        );
      await tx
        .update(invitations)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(
          and(
            eq(invitations.emailNormalised, application.emailNormalised),
            ne(invitations.status, "accepted"),
          ),
        );
      const [invite] = await tx
        .insert(invitations)
        .values({
          emailNormalised: application.emailNormalised,
          applicationId,
          profileId: profile.id,
          type: "applicant",
          status: "pending",
          tokenHash: tokenHash(token),
          expiresAt,
          createdBy: actorProfileId,
        })
        .returning({ id: invitations.id });
      const url = new URL(
        "/auth/accept-invite",
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      );
      url.searchParams.set("token", `${invite.id}.${token}`);
      await tx.insert(emailOutbox).values({
        templateKey: "applicant_invitation",
        recipientEmail: application.emailNormalised,
        recipientProfileId: profile.id,
        applicationId,
        payload: {
          name: application.nomineeName,
          reference: application.reference,
          url: url.toString(),
          expiresAt: expiresAt.toISOString(),
        },
        idempotencyKey: `applicant_invitation:${invite.id}:1`,
      });
      await tx
        .update(applications)
        .set({ accountAccessStatus: "invited", updatedAt: new Date() })
        .where(eq(applications.id, applicationId));
      await tx.insert(auditLogs).values({
        actorProfileId,
        actorType: "staff",
        action: "applicant invitation issued",
        entityType: "invitation",
        entityId: invite.id,
        applicationId,
        afterRedacted: { expiresAt: expiresAt.toISOString() },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
      return { linked: false as const };
    });
    return result;
  } catch (error) {
    await auth.api
      .removeUser({
        headers: await headers(),
        body: { userId: created.user.id },
      })
      .catch(() => undefined);
    throw error;
  }
}
