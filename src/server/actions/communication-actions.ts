"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  applicationMessages,
  applications,
  auditLogs,
  emailOutbox,
  invitations,
  systemSettings,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import { emailTemplateDefaults } from "@/lib/domain/email-templates";

export async function retryEmailAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "messages.send") ||
    !hasPermission(membership, "applications.view_all")
  )
    throw new Error("Communication administration permission is required.");
  const id = z.uuid().parse(formData.get("emailId"));
  await enforceRateLimit(`email-retry:${profile.id}`, 20, 3600);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        templateKey: emailOutbox.templateKey,
        idempotencyKey: emailOutbox.idempotencyKey,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, id))
      .limit(1);
    const retried = await tx
      .update(emailOutbox)
      .set({
        status: "queued",
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorSummary: null,
      })
      .where(
        and(
          eq(emailOutbox.id, id),
          inArray(emailOutbox.status, ["failed", "cancelled"]),
        ),
      )
      .returning({ id: emailOutbox.id });
    if (!retried.length)
      throw new Error("Only failed or cancelled email can be retried.");
    if (
      item &&
      ["applicant_invitation", "staff_invitation"].includes(item.templateKey)
    ) {
      const invitationId = item.idempotencyKey.split(":")[1];
      if (invitationId)
        await tx
          .update(invitations)
          .set({ status: "pending", lastError: null, updatedAt: new Date() })
          .where(eq(invitations.id, invitationId));
    }
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "email delivery retried",
      entityType: "email_outbox",
      entityId: id,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/communications");
}

export async function sendManualApplicantMessageAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "messages.send"))
    throw new Error("Communication permission is required.");
  const input = z
    .object({
      applicationReference: z.string().trim().min(3).max(40),
      subject: z.string().trim().min(2).max(160),
      body: z.string().trim().min(2).max(4000),
    })
    .parse(Object.fromEntries(formData));
  await enforceRateLimit(`manual-message:${profile.id}`, 30, 3600);
  const db = getDb();
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.reference, input.applicationReference))
    .limit(1);
  if (
    !application ||
    (!hasPermission(membership, "applications.view_all") &&
      application.assignedReviewerId !== profile.id)
  )
    throw new Error("Application not found or not assigned to you.");
  await db.transaction(async (tx) => {
    const [message] = await tx
      .insert(applicationMessages)
      .values({
        applicationId: application.id,
        senderProfileId: profile.id,
        senderType: "staff",
        visibility: "applicant",
        subject: input.subject,
        body: input.body,
      })
      .returning({ id: applicationMessages.id });
    await tx.insert(emailOutbox).values({
      templateKey: "applicant_message",
      recipientEmail: application.emailNormalised,
      recipientProfileId: application.ownerProfileId,
      applicationId: application.id,
      payload: {
        name: application.nomineeName,
        title: input.subject,
        message: input.body,
        reference: application.reference,
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/messages`,
      },
      idempotencyKey: `manual_applicant_message:${message.id}`,
    });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "manual applicant communication queued",
      entityType: "application_message",
      entityId: message.id,
      applicationId: application.id,
      afterRedacted: {
        recipientProfileId: application.ownerProfileId,
        subject: input.subject,
      },
      metadataRedacted: { templateKey: "applicant_message" },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/communications");
}

export async function saveEmailTemplateAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "settings.manage"))
    throw new Error("System-settings permission is required.");
  const input = z
    .object({
      templateKey: z.string().trim().min(1).max(100),
      title: z.string().trim().min(2).max(180),
      message: z.string().trim().min(2).max(1000),
      actionLabel: z.string().trim().max(80).optional(),
    })
    .parse(Object.fromEntries(formData));
  if (!emailTemplateDefaults[input.templateKey])
    throw new Error("Unknown transactional email template.");
  const db = getDb();
  const [before] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "email_templates"))
    .limit(1);
  const current =
    before?.value && typeof before.value === "object"
      ? (before.value as Record<string, unknown>)
      : {};
  const next = {
    ...current,
    [input.templateKey]: {
      title: input.title,
      message: input.message,
      ...(input.actionLabel ? { actionLabel: input.actionLabel } : {}),
    },
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(systemSettings)
      .values({ key: "email_templates", value: next, updatedBy: profile.id })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: next, updatedBy: profile.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "email template copy updated",
      entityType: "system_setting",
      afterRedacted: { templateKey: input.templateKey },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/communications");
}
