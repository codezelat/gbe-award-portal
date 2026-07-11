"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { requirePortalSession } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import { applicationMessages, auditLogs, profiles } from "@/lib/db/schema";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import {
  getFeatureFlags,
  requireFeatureFlag,
} from "@/server/services/feature-flags";
import { env } from "@/lib/env";
export async function updateProfileAction(formData: FormData) {
  const { profile } = await requirePortalSession();
  const flags = await getFeatureFlags();
  const input = z
    .object({
      displayName: z.string().trim().min(2).max(180),
      designation: z.string().trim().max(160).optional(),
      industrySector: z.string().trim().max(160).optional(),
      phoneDisplay: z.string().trim().max(40).optional(),
      alternateEmail: z.union([z.literal(""), z.email()]).optional(),
      businessWebsite: z.union([z.literal(""), z.url()]).optional(),
      addressLine1: z.string().trim().max(200).optional(),
      addressLine2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
      region: z.string().trim().max(120).optional(),
      postalCode: z.string().trim().max(30).optional(),
      countryCode: z.string().trim().length(2).optional().or(z.literal("")),
      shortBio: z.string().trim().max(1000).optional(),
      linkedinUrl: z.union([z.literal(""), z.url()]).optional(),
      facebookUrl: z.union([z.literal(""), z.url()]).optional(),
      instagramUrl: z.union([z.literal(""), z.url()]).optional(),
    })
    .parse(Object.fromEntries(formData));
  if (!flags.profile_social_fields_enabled) {
    delete input.linkedinUrl;
    delete input.facebookUrl;
    delete input.instagramUrl;
  }
  const before = {
    displayName: profile.displayName,
    designation: profile.designation,
    phoneDisplay: profile.phoneDisplay,
  };
  await getDb()
    .update(profiles)
    .set({
      ...input,
      countryCode: input.countryCode || null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profile.id));
  await getDb()
    .insert(auditLogs)
    .values({
      actorProfileId: profile.id,
      actorType: "applicant",
      action: "profile updated",
      entityType: "profile",
      entityId: profile.id,
      beforeRedacted: before,
      afterRedacted: {
        displayName: input.displayName,
        designation: input.designation,
        phoneDisplay: input.phoneDisplay,
      },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  revalidatePath("/portal/profile");
}
export async function sendApplicantMessageAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  await requireFeatureFlag("applicant_messages_enabled");
  const { profile } = await requirePortalSession();
  const input = z
    .object({
      applicationId: z.uuid(),
      subject: z.string().trim().max(160).optional(),
      body: z.string().trim().min(2).max(4000),
    })
    .parse(Object.fromEntries(formData));
  const { applications } = await import("@/lib/db/schema");
  const [owned] = await getDb()
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.ownerProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!owned) throw new Error("Application not found.");
  await enforceRateLimit(`applicant-message:${profile.id}`, 10, 3600);
  const { emailOutbox } = await import("@/lib/db/schema");
  await getDb().transaction(async (tx) => {
    const [message] = await tx
      .insert(applicationMessages)
      .values({
        ...input,
        senderProfileId: profile.id,
        senderType: "applicant",
        visibility: "applicant",
      })
      .returning({ id: applicationMessages.id });
    await tx.insert(emailOutbox).values({
      templateKey: "applicant_message_received",
      recipientEmail: env.SUPPORT_EMAIL,
      applicationId: input.applicationId,
      payload: {
        title: input.subject || "Applicant portal message",
        name: profile.displayName,
        message: input.body,
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/applications/${input.applicationId}`,
      },
      idempotencyKey: `applicant_message_received:${message.id}`,
    });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "applicant",
      action: "applicant message sent",
      entityType: "application_message",
      entityId: message.id,
      applicationId: input.applicationId,
      metadataRedacted: { subject: input.subject },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/portal/messages");
}

export async function submitRequestedChangesAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile } = await requirePortalSession();
  const input = z
    .object({
      applicationId: z.uuid(),
      requestId: z.uuid(),
      nomineeName: z.string().trim().min(2).max(180).optional(),
      designation: z.string().trim().max(120).optional(),
      industrySector: z.string().trim().min(2).max(160).optional(),
      businessWebsite: z.union([z.literal(""), z.url()]).optional(),
      phoneDisplay: z.string().trim().min(5).max(40).optional(),
    })
    .parse(Object.fromEntries(formData));
  const {
    applicationChangeRequests,
    applicationFieldAccess,
    applicationStatusHistory,
    applicationVersions,
    applicationFiles,
    applications,
    emailOutbox,
  } = await import("@/lib/db/schema");
  const db = getDb();
  const [application] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.ownerProfileId, profile.id),
        eq(applications.workflowStatus, "changes_requested"),
      ),
    )
    .limit(1);
  const [request] = await db
    .select()
    .from(applicationChangeRequests)
    .where(
      and(
        eq(applicationChangeRequests.id, input.requestId),
        eq(applicationChangeRequests.applicationId, input.applicationId),
        eq(applicationChangeRequests.status, "open"),
      ),
    )
    .limit(1);
  if (!application || !request)
    throw new Error("This change request is no longer available.");
  if (request.requestedFileKinds.includes("requested_document")) {
    const [uploaded] = await db
      .select({ id: applicationFiles.id })
      .from(applicationFiles)
      .where(
        and(
          eq(applicationFiles.applicationId, application.id),
          eq(applicationFiles.kind, "requested_document"),
          gte(applicationFiles.createdAt, request.createdAt),
        ),
      )
      .limit(1);
    if (!uploaded)
      throw new Error("Upload the requested supporting document first.");
  }
  const allowed = new Set(request.fieldKeys);
  const updates: Partial<
    Pick<
      typeof application,
      | "nomineeName"
      | "designation"
      | "industrySector"
      | "businessWebsite"
      | "phoneDisplay"
    >
  > = {};
  if (allowed.has("nomineeName") && input.nomineeName !== undefined)
    updates.nomineeName = input.nomineeName;
  if (allowed.has("designation") && input.designation !== undefined)
    updates.designation = input.designation || null;
  if (allowed.has("industrySector") && input.industrySector !== undefined)
    updates.industrySector = input.industrySector;
  if (allowed.has("businessWebsite") && input.businessWebsite !== undefined)
    updates.businessWebsite = input.businessWebsite || null;
  if (allowed.has("phoneDisplay") && input.phoneDisplay !== undefined)
    updates.phoneDisplay = input.phoneDisplay;
  if (!Object.keys(updates).length && !request.requestedFileKinds.length)
    throw new Error("No requested changes were supplied.");
  const nextVersion = application.currentVersion + 1;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(applicationVersions).values({
      applicationId: application.id,
      version: nextVersion,
      source: "applicant_resubmission",
      payload: { ...application, ...updates },
      changedFields: Object.keys(updates),
      createdByProfileId: profile.id,
    });
    const updated = await tx
      .update(applications)
      .set({
        ...updates,
        workflowStatus: "resubmitted",
        currentVersion: nextVersion,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(applications.id, application.id),
          eq(applications.workflowStatus, "changes_requested"),
          eq(applications.currentVersion, application.currentVersion),
        ),
      )
      .returning({ id: applications.id });
    if (!updated.length)
      throw new Error(
        "The application changed while you were editing it. Refresh and try again.",
      );
    await tx
      .update(applicationFieldAccess)
      .set({ state: "locked", updatedBy: profile.id, updatedAt: now })
      .where(eq(applicationFieldAccess.requestId, request.id));
    const completed = await tx
      .update(applicationChangeRequests)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(applicationChangeRequests.id, request.id),
          eq(applicationChangeRequests.status, "open"),
        ),
      )
      .returning({ id: applicationChangeRequests.id });
    if (!completed.length)
      throw new Error("This change request was already completed.");
    await tx.insert(applicationStatusHistory).values({
      applicationId: application.id,
      fromStatus: "changes_requested",
      toStatus: "resubmitted",
      applicantLabel: "Updates received",
      applicantMessage: "Your requested updates have been received.",
      changedByProfileId: profile.id,
    });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "applicant",
      action: "requested changes submitted",
      entityType: "application",
      entityId: application.id,
      applicationId: application.id,
      beforeRedacted: { version: application.currentVersion },
      afterRedacted: {
        version: nextVersion,
        changedFields: Object.keys(updates),
      },
      metadataRedacted: { requestId: request.id },
      requestId: crypto.randomUUID(),
    });
    await tx.insert(emailOutbox).values({
      templateKey: "updates_received",
      recipientEmail: application.emailNormalised,
      recipientProfileId: profile.id,
      applicationId: application.id,
      payload: {
        name: profile.displayName,
        reference: application.reference,
        title: "Updates received",
        message:
          "Your requested updates have been received by the GBE Awards team.",
      },
      idempotencyKey: `updates_received:${request.id}`,
    });
  });
  revalidatePath(`/portal/applications/${application.id}`);
  revalidatePath("/portal");
}
