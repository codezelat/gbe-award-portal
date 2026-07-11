"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import {
  changeApplicationStatus,
  changeApplicationStatusWithTx,
} from "@/server/services/application-transition-service";
import { createOrRefreshApplicantInvitation } from "@/server/services/invitation-service";
import {
  applicationNotes,
  applications,
  auditLogs,
  emailOutbox,
  payments,
  profiles,
  awardCycles,
  cycleSequences,
} from "@/lib/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import { requireFeatureFlag } from "@/server/services/feature-flags";

const statusSchema = z.object({
  applicationId: z.uuid(),
  to: z.enum([
    "under_review",
    "changes_requested",
    "approved",
    "rejected",
    "withdrawn",
    "entry_confirmed",
    "shortlisted",
    "winner",
    "not_selected",
    "archived",
  ]),
  reason: z.string().trim().max(1000).optional(),
  applicantMessage: z.string().trim().max(2000).optional(),
});
async function assertApplicationAccess(
  profileId: string,
  membership: { role: string; permissions: unknown },
  applicationId: string,
) {
  const [record] = await getDb()
    .select({ assignedReviewerId: applications.assignedReviewerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (
    !record ||
    (!hasPermission(membership, "applications.view_all") &&
      record.assignedReviewerId !== profileId)
  )
    throw new Error("Application not found or not assigned to you.");
}
export async function changeStatusAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "applications.change_status") &&
    !["admin", "super_admin"].includes(membership.role)
  )
    throw new Error("You do not have permission to change status.");
  const input = statusSchema.parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  if (
    membership.role === "reviewer" &&
    !(["under_review", "changes_requested"] as string[]).includes(input.to)
  )
    throw new Error(
      "Reviewers may only begin review or request applicant changes.",
    );
  await enforceRateLimit(`status-change:${profile.id}`, 60, 3600);
  if (
    input.to === "approved" &&
    !hasPermission(membership, "applications.approve")
  )
    throw new Error("Approval permission is required.");
  if (
    input.to === "rejected" &&
    !hasPermission(membership, "applications.reject")
  )
    throw new Error("Rejection permission is required.");
  if (
    ["shortlisted", "winner", "not_selected"].includes(input.to) &&
    !hasPermission(membership, "applications.release_outcome")
  )
    throw new Error("Outcome release permission is required.");
  await changeApplicationStatus({
    ...input,
    actorProfileId: profile.id,
    requestId: crypto.randomUUID(),
  });
  if (input.to === "approved")
    await createOrRefreshApplicantInvitation(input.applicationId, profile.id);
  revalidatePath(`/admin/applications/${input.applicationId}`);
  revalidatePath("/admin/applications");
}
export async function issuePortalAccessAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "applications.approve"))
    throw new Error("Approval permission is required.");
  const applicationId = z.uuid().parse(formData.get("applicationId"));
  await assertApplicationAccess(profile.id, membership, applicationId);
  await enforceRateLimit(
    `portal-access:${profile.id}:${applicationId}`,
    5,
    3600,
  );
  await createOrRefreshApplicantInvitation(applicationId, profile.id);
  revalidatePath(`/admin/applications/${applicationId}`);
}
export async function setApplicationDeletionAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (membership.role !== "super_admin")
    throw new Error("Super-administrator permission is required.");
  const input = z
    .object({
      applicationId: z.uuid(),
      mode: z.enum(["delete", "restore"]),
      reason: z.string().trim().min(12).max(1000),
    })
    .parse(Object.fromEntries(formData));
  await enforceRateLimit(`application-retention:${profile.id}`, 20, 3600);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ deletedAt: applications.deletedAt })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!before) throw new Error("Application not found.");
    const deleting = input.mode === "delete";
    if (deleting === Boolean(before.deletedAt))
      throw new Error(
        `The application is already ${deleting ? "soft-deleted" : "active"}.`,
      );
    await tx
      .update(applications)
      .set({
        deletedAt: deleting ? new Date() : null,
        deletedBy: deleting ? profile.id : null,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, input.applicationId));
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: deleting ? "application soft deleted" : "application restored",
      entityType: "application",
      entityId: input.applicationId,
      applicationId: input.applicationId,
      beforeRedacted: { deleted: Boolean(before.deletedAt) },
      afterRedacted: { deleted: deleting },
      reason: input.reason,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath(`/admin/applications/${input.applicationId}`);
  revalidatePath("/admin/applications");
}
export async function addInternalNoteAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "applications.edit") &&
    !["admin", "super_admin", "reviewer", "finance"].includes(membership.role)
  )
    throw new Error("You do not have permission to add notes.");
  const input = z
    .object({
      applicationId: z.uuid(),
      body: z.string().trim().min(2).max(4000),
      noteType: z.enum(["general", "review", "finance", "security"]),
    })
    .parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  await getDb()
    .insert(applicationNotes)
    .values({ ...input, createdBy: profile.id });
  revalidatePath(`/admin/applications/${input.applicationId}`);
}
export async function updatePaymentAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "payments.verify") &&
    !["finance", "admin", "super_admin"].includes(membership.role)
  )
    throw new Error("You do not have finance permission.");
  const input = z
    .object({
      applicationId: z.uuid(),
      status: z.enum([
        "under_review",
        "verified",
        "rejected",
        "waived",
        "refunded",
      ]),
      note: z.string().trim().max(2000).optional(),
      payerName: z.string().trim().max(180).optional(),
      bankReference: z.string().trim().max(160).optional(),
      amount: z
        .union([
          z.literal(""),
          z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Enter a valid amount."),
        ])
        .optional(),
      currency: z
        .union([z.literal(""), z.string().trim().length(3)])
        .optional(),
      paidAt: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  if (
    ["waived", "refunded"].includes(input.status) &&
    membership.role !== "super_admin" &&
    !hasPermission(membership, "payments.override")
  )
    throw new Error(
      "Elevated payment-override permission is required for this decision.",
    );
  await enforceRateLimit(`payment-status:${profile.id}`, 60, 3600);
  const db = getDb();
  const [before] = await db
    .select()
    .from(payments)
    .where(eq(payments.applicationId, input.applicationId))
    .limit(1);
  if (!before) throw new Error("Payment record not found.");
  const statusChanged = before.status !== input.status;
  if (
    ["rejected", "waived", "refunded"].includes(input.status) &&
    (!input.note || input.note.length < 8)
  )
    throw new Error("A meaningful reason is required for this decision.");
  const amountMinor =
    input.amount === undefined
      ? before.amountMinor
      : input.amount
        ? Math.round(Number.parseFloat(input.amount) * 100)
        : null;
  const paidAt =
    input.paidAt === undefined
      ? before.paidAt
      : input.paidAt
        ? new Date(input.paidAt)
        : null;
  const payerName =
    input.payerName === undefined ? before.payerName : input.payerName || null;
  const bankReference =
    input.bankReference === undefined
      ? before.bankReference
      : input.bankReference || null;
  const currency =
    input.currency === undefined
      ? before.currency
      : input.currency?.toUpperCase() || null;
  if (paidAt && Number.isNaN(paidAt.getTime()))
    throw new Error("Enter a valid payment date.");
  const now = new Date();
  await db.transaction(async (tx) => {
    const [application] = await tx
      .select({
        email: applications.emailNormalised,
        reference: applications.reference,
        ownerProfileId: applications.ownerProfileId,
        cycleId: applications.cycleId,
        cycleYear: awardCycles.year,
      })
      .from(applications)
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!application) throw new Error("Application not found.");
    let receiptReference = before.receiptReference;
    if (
      statusChanged &&
      ["verified", "waived"].includes(input.status) &&
      !receiptReference
    ) {
      await tx
        .insert(cycleSequences)
        .values({ cycleId: application.cycleId, nextReceiptNumber: 2 })
        .onConflictDoUpdate({
          target: cycleSequences.cycleId,
          set: {
            nextReceiptNumber: sql`${cycleSequences.nextReceiptNumber}+1`,
            updatedAt: now,
          },
        });
      const [sequence] = await tx
        .select({ next: cycleSequences.nextReceiptNumber })
        .from(cycleSequences)
        .where(eq(cycleSequences.cycleId, application.cycleId));
      receiptReference = `RCT-${application.cycleYear}-${String(Math.max(1, sequence.next - 1)).padStart(6, "0")}`;
    }
    const paymentUpdated = await tx
      .update(payments)
      .set({
        status: input.status,
        financeNote: input.note,
        payerName,
        bankReference,
        amountMinor,
        currency,
        paidAt,
        receiptReference,
        verifiedBy: ["verified", "waived"].includes(input.status)
          ? profile.id
          : null,
        verifiedAt: ["verified", "waived"].includes(input.status) ? now : null,
        rejectedReason: input.status === "rejected" ? input.note : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(payments.applicationId, input.applicationId),
          eq(payments.status, before.status),
        ),
      )
      .returning({ id: payments.id });
    if (!paymentUpdated.length)
      throw new Error(
        "The payment changed while you were reviewing it. Refresh and try again.",
      );
    const applicationUpdated = await tx
      .update(applications)
      .set({ paymentStatus: input.status, lastActivityAt: now, updatedAt: now })
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.paymentStatus, before.status),
        ),
      )
      .returning({ id: applications.id });
    if (!applicationUpdated.length)
      throw new Error(
        "The application payment state changed. Refresh and try again.",
      );
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "payment status changed",
      entityType: "payment",
      entityId: before.id,
      applicationId: input.applicationId,
      beforeRedacted: { status: before.status },
      afterRedacted: {
        status: input.status,
        payerName,
        bankReference,
        amountMinor,
        currency,
        paidAt: paidAt?.toISOString() ?? null,
        receiptReference,
      },
      reason: input.note,
      requestId: crypto.randomUUID(),
    });
    if (statusChanged)
      await tx.insert(emailOutbox).values({
        templateKey: `payment_${input.status}`,
        recipientEmail: application.email,
        recipientProfileId: application.ownerProfileId,
        applicationId: input.applicationId,
        payload: {
          reference: application.reference,
          paymentReference: before.paymentReference,
          receiptReference,
          status: input.status.replaceAll("_", " "),
          message: input.note,
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/payment`,
        },
        idempotencyKey: `payment_status:${before.id}:${input.status}:${now.toISOString()}`,
      });
  });
  revalidatePath(`/admin/applications/${input.applicationId}`);
}

const editableApplicationFields = [
  "nomineeName",
  "designation",
  "industrySector",
  "businessWebsite",
  "phoneDisplay",
] as const;

export async function requestChangesAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "applications.change_status") &&
    !["admin", "super_admin", "reviewer"].includes(membership.role)
  )
    throw new Error("You do not have permission to request changes.");
  const input = z
    .object({
      applicationId: z.uuid(),
      instructions: z.string().trim().min(10).max(3000),
      dueAt: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  const requested = formData.getAll("fieldKeys");
  const fieldKeys = editableApplicationFields.filter((field) =>
    requested.includes(field),
  );
  const requestedFileKinds = formData
    .getAll("requestedFileKinds")
    .filter((value): value is string => typeof value === "string");
  if (!fieldKeys.length && !requestedFileKinds.length)
    throw new Error("Select at least one field or document requirement.");
  const { applicationChangeRequests, applicationFieldAccess } =
    await import("@/lib/db/schema");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(applicationChangeRequests)
      .values({
        applicationId: input.applicationId,
        fieldKeys,
        requestedFileKinds,
        instructions: input.instructions,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        status: "open",
        requestedBy: profile.id,
      })
      .returning({ id: applicationChangeRequests.id });
    for (const fieldKey of fieldKeys)
      await tx
        .insert(applicationFieldAccess)
        .values({
          applicationId: input.applicationId,
          fieldKey,
          state: "applicant_editable",
          requestId: request.id,
          updatedBy: profile.id,
        })
        .onConflictDoUpdate({
          target: [
            applicationFieldAccess.applicationId,
            applicationFieldAccess.fieldKey,
          ],
          set: {
            state: "applicant_editable",
            requestId: request.id,
            updatedBy: profile.id,
            updatedAt: new Date(),
          },
        });
    await changeApplicationStatusWithTx(tx, {
      applicationId: input.applicationId,
      to: "changes_requested",
      actorProfileId: profile.id,
      reason: "Applicant information requested",
      applicantMessage: input.instructions,
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath(`/admin/applications/${input.applicationId}`);
}

export async function editApplicationAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  const { profile, membership } = await requireStaff();
  if (
    !hasPermission(membership, "applications.edit") &&
    !["admin", "super_admin"].includes(membership.role)
  )
    throw new Error("Application editing permission is required.");
  const input = z
    .object({
      applicationId: z.uuid(),
      version: z.coerce.number().int().nonnegative(),
      nomineeName: z.string().trim().min(2).max(180),
      designation: z.string().trim().max(120).optional(),
      industrySector: z.string().trim().min(2).max(160),
      businessWebsite: z.union([z.literal(""), z.url()]).optional(),
      email: z.email(),
      phoneDisplay: z.string().trim().min(5).max(40),
      categoryId: z.uuid(),
      reason: z.string().trim().min(8).max(1000),
      reauthPassword: z.string().max(128).optional(),
    })
    .parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  const { applicationVersions, awardCategories } =
    await import("@/lib/db/schema");
  const db = getDb();
  const [preview] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!preview) throw new Error("Application not found.");
  const emailChanged =
    preview.emailNormalised !== input.email.trim().toLowerCase();
  const categoryChanged = preview.categoryId !== input.categoryId;
  if ((emailChanged || categoryChanged) && membership.role !== "super_admin")
    throw new Error(
      "Primary email and category corrections require super-administrator permission.",
    );
  const requestHeaders = await headers();
  if (emailChanged || categoryChanged) {
    if (!input.reauthPassword || input.reauthPassword.length < 1)
      throw new Error(
        "Confirm your current password before changing primary identity or category data.",
      );
    await getAuth().api.verifyPassword({
      headers: requestHeaders,
      body: { password: input.reauthPassword },
    });
  }
  let linkedAuthUserId: string | null = null;
  if (emailChanged && preview.ownerProfileId) {
    const [owner] = await db
      .select({ authUserId: profiles.authUserId })
      .from(profiles)
      .where(eq(profiles.id, preview.ownerProfileId))
      .limit(1);
    linkedAuthUserId = owner?.authUserId ?? null;
    if (!linkedAuthUserId)
      throw new Error("The linked applicant identity could not be found.");
    await getAuth().api.adminUpdateUser({
      headers: requestHeaders,
      body: {
        userId: linkedAuthUserId,
        data: { email: input.email.trim().toLowerCase(), emailVerified: false },
      },
    });
  }
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .limit(1);
      if (!current) throw new Error("Application not found.");
      if (current.currentVersion !== input.version)
        throw new Error(
          "This application changed while you were editing it. Refresh and try again.",
        );
      const [category] = await tx
        .select()
        .from(awardCategories)
        .where(eq(awardCategories.id, input.categoryId))
        .limit(1);
      if (!category || category.cycleId !== current.cycleId)
        throw new Error(
          "The selected category does not belong to this award cycle.",
        );
      const changedFields = [
        "nomineeName",
        "designation",
        "industrySector",
        "businessWebsite",
        "email",
        "phoneDisplay",
        "categoryId",
      ].filter((key) => {
        const before =
          key === "email"
            ? current.emailNormalised
            : current[key as keyof typeof current];
        return before !== input[key as keyof typeof input];
      });
      if (!changedFields.length)
        throw new Error("No application values were changed.");
      const nextVersion = current.currentVersion + 1;
      const now = new Date();
      await tx.insert(applicationVersions).values({
        applicationId: current.id,
        version: nextVersion,
        source: "staff_correction",
        payload: {
          ...current,
          ...input,
          emailNormalised: input.email.toLowerCase(),
          categoryNameSnapshot: category.name,
          categoryCodeSnapshot: category.code,
        },
        changedFields,
        reason: input.reason,
        createdByProfileId: profile.id,
      });
      const updated = await tx
        .update(applications)
        .set({
          nomineeName: input.nomineeName,
          designation: input.designation || null,
          industrySector: input.industrySector,
          businessWebsite: input.businessWebsite || null,
          emailNormalised: input.email.toLowerCase(),
          emailDisplay: input.email,
          phoneDisplay: input.phoneDisplay,
          categoryId: category.id,
          categoryNameSnapshot: category.name,
          categoryCodeSnapshot: category.code,
          currentVersion: nextVersion,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(applications.id, current.id),
            eq(applications.currentVersion, input.version),
          ),
        )
        .returning({ id: applications.id });
      if (!updated.length)
        throw new Error("The application changed while you were editing it.");
      await tx.insert(auditLogs).values({
        actorProfileId: profile.id,
        actorType: "staff",
        action: "application data corrected",
        entityType: "application",
        entityId: current.id,
        applicationId: current.id,
        beforeRedacted: Object.fromEntries(
          changedFields.map((key) => [
            key,
            key === "email"
              ? current.emailNormalised
              : current[key as keyof typeof current],
          ]),
        ),
        afterRedacted: Object.fromEntries(
          changedFields.map((key) => [key, input[key as keyof typeof input]]),
        ),
        reason: input.reason,
        metadataRedacted: { version: nextVersion },
        requestId: crypto.randomUUID(),
      });
    });
  } catch (error) {
    if (emailChanged && linkedAuthUserId)
      await getAuth()
        .api.adminUpdateUser({
          headers: requestHeaders,
          body: {
            userId: linkedAuthUserId,
            data: {
              email: preview.emailNormalised,
              emailVerified: true,
            },
          },
        })
        .catch(() => undefined);
    throw error;
  }
  if (emailChanged && linkedAuthUserId) {
    await getAuth().api.revokeUserSessions({
      headers: requestHeaders,
      body: { userId: linkedAuthUserId },
    });
    await getAuth().api.sendVerificationEmail({
      body: {
        email: input.email.trim().toLowerCase(),
        callbackURL: "/portal",
      },
    });
    await db.insert(emailOutbox).values({
      templateKey: "account_security_change",
      recipientEmail: preview.emailNormalised,
      applicationId: preview.id,
      payload: {
        name: preview.nomineeName,
        message:
          "The primary email address for your GBE Awards portal was changed by an authorised administrator. Contact support immediately if you did not expect this change.",
      },
      idempotencyKey: `primary_email_changed:${preview.id}:${crypto.randomUUID()}`,
    });
  }
  revalidatePath(`/admin/applications/${input.applicationId}`);
  revalidatePath("/admin/applications");
}

export async function sendStaffMessageAction(formData: FormData) {
  scheduleEmailOutboxProcessing();
  await requireFeatureFlag("applicant_messages_enabled");
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "messages.send"))
    throw new Error("Messaging permission is required.");
  const input = z
    .object({
      applicationId: z.uuid(),
      subject: z.string().trim().min(2).max(160),
      body: z.string().trim().min(2).max(4000),
    })
    .parse(Object.fromEntries(formData));
  await assertApplicationAccess(profile.id, membership, input.applicationId);
  const { applicationMessages, emailOutbox } = await import("@/lib/db/schema");
  const db = getDb();
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!application) throw new Error("Application not found.");
  await db.transaction(async (tx) => {
    const [message] = await tx
      .insert(applicationMessages)
      .values({
        applicationId: input.applicationId,
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
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/messages`,
      },
      idempotencyKey: `applicant_message:${message.id}`,
    });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "applicant message sent",
      entityType: "application_message",
      entityId: message.id,
      applicationId: application.id,
      metadataRedacted: { subject: input.subject },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath(`/admin/applications/${input.applicationId}`);
}
