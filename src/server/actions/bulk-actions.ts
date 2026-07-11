"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import {
  applicationMessages,
  applications,
  applicationStatusHistory,
  auditLogs,
  emailOutbox,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";
import { enforceRateLimit } from "@/server/security/rate-limit";

const idsFrom = (formData: FormData) =>
  z.array(z.uuid()).min(1).max(100).parse(formData.getAll("applicationIds"));

export async function bulkAssignReviewerAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "applications.edit"))
    throw new Error("Application editing permission is required.");
  const ids = idsFrom(formData);
  const reviewerId = z
    .uuid()
    .nullable()
    .parse(formData.get("reviewerId") || null);
  const db = getDb();
  if (reviewerId) {
    const [reviewer] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .innerJoin(staffMemberships, eq(staffMemberships.profileId, profiles.id))
      .where(
        and(
          eq(profiles.id, reviewerId),
          eq(profiles.accountKind, "staff"),
          eq(profiles.isActive, true),
        ),
      )
      .limit(1);
    if (!reviewer)
      throw new Error("The selected reviewer is not active staff.");
  }
  await db.transaction(async (tx) => {
    const scoped = await tx
      .select({
        id: applications.id,
        assignedReviewerId: applications.assignedReviewerId,
      })
      .from(applications)
      .where(inArray(applications.id, ids));
    if (
      scoped.length !== new Set(ids).size ||
      (!hasPermission(membership, "applications.view_all") &&
        scoped.some((row) => row.assignedReviewerId !== profile.id))
    )
      throw new Error(
        "One or more applications are outside your authorised scope.",
      );
    await tx
      .update(applications)
      .set({
        assignedReviewerId: reviewerId,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(applications.id, ids));
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "applications bulk assigned",
      entityType: "application_batch",
      afterRedacted: { reviewerId, count: ids.length },
      metadataRedacted: { applicationIds: ids },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/applications");
}

const safeBulkStatuses = {
  under_review: {
    from: ["submitted", "resubmitted"],
    applicantLabel: "Under review",
  },
  archived: {
    from: ["rejected", "withdrawn", "not_selected"],
    applicantLabel: "Archived",
  },
} as const;

export async function bulkChangeSafeStatusAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "applications.change_status"))
    throw new Error("Status-change permission is required.");
  const ids = idsFrom(formData);
  await enforceRateLimit(`bulk-status:${profile.id}`, 20, 3600);
  const to = z.enum(["under_review", "archived"]).parse(formData.get("to"));
  const reason = z
    .string()
    .trim()
    .max(1000)
    .optional()
    .parse(formData.get("reason") || undefined);
  if (to === "archived" && (!reason || reason.length < 8))
    throw new Error("A meaningful archive reason is required.");
  const rule = safeBulkStatuses[to];
  const db = getDb();
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: applications.id,
        status: applications.workflowStatus,
        assignedReviewerId: applications.assignedReviewerId,
        email: applications.emailNormalised,
        reference: applications.reference,
      })
      .from(applications)
      .where(inArray(applications.id, ids));
    if (rows.length !== new Set(ids).size)
      throw new Error("One or more selected applications no longer exist.");
    if (
      !hasPermission(membership, "applications.view_all") &&
      rows.some((row) => row.assignedReviewerId !== profile.id)
    )
      throw new Error("One or more applications are not assigned to you.");
    if (to === "archived" && !hasPermission(membership, "applications.edit"))
      throw new Error("Archiving permission is required.");
    if (
      rows.some((row) => !(rule.from as readonly string[]).includes(row.status))
    )
      throw new Error(
        `Every selected application must be in: ${rule.from.join(", ")}.`,
      );
    const now = new Date();
    for (const row of rows) {
      const updated = await tx
        .update(applications)
        .set({ workflowStatus: to, lastActivityAt: now, updatedAt: now })
        .where(
          and(
            eq(applications.id, row.id),
            eq(applications.workflowStatus, row.status),
          ),
        )
        .returning({ id: applications.id });
      if (!updated.length)
        throw new Error(
          "A selected application changed. Refresh and try again.",
        );
      await tx.insert(applicationStatusHistory).values({
        applicationId: row.id,
        fromStatus: row.status,
        toStatus: to,
        applicantLabel: rule.applicantLabel,
        internalReason: reason,
        changedByProfileId: profile.id,
      });
      await tx.insert(emailOutbox).values({
        templateKey: `application_${to}`,
        recipientEmail: row.email,
        applicationId: row.id,
        payload: { reference: row.reference, status: rule.applicantLabel },
        idempotencyKey: `bulk_status:${row.id}:${to}:${now.toISOString()}`,
      });
    }
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "applications bulk status changed",
      entityType: "application_batch",
      afterRedacted: { to, count: rows.length },
      reason,
      metadataRedacted: { applicationIds: ids },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/applications");
}

const communicationTemplates = {
  review_update: {
    subject: "Your GBE Awards nomination is being reviewed",
    body: "The GBE Awards team is continuing its review of your nomination. No action is required unless we contact you separately.",
  },
  deadline_reminder: {
    subject: "Reminder: check your GBE Awards portal",
    body: "Please sign in to your GBE Awards portal to review any current action or document request before its stated deadline.",
  },
} as const;

export async function bulkSendTemplateAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "messages.send"))
    throw new Error("Messaging permission is required.");
  const ids = idsFrom(formData);
  await enforceRateLimit(`bulk-message:${profile.id}`, 10, 3600);
  const key = z
    .enum(["review_update", "deadline_reminder"])
    .parse(formData.get("template"));
  const template = communicationTemplates[key];
  const db = getDb();
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: applications.id,
        email: applications.emailNormalised,
        ownerProfileId: applications.ownerProfileId,
        reference: applications.reference,
        assignedReviewerId: applications.assignedReviewerId,
      })
      .from(applications)
      .where(inArray(applications.id, ids));
    if (rows.length !== new Set(ids).size)
      throw new Error("One or more selected applications no longer exist.");
    if (
      !hasPermission(membership, "applications.view_all") &&
      rows.some((row) => row.assignedReviewerId !== profile.id)
    )
      throw new Error("One or more applications are not assigned to you.");
    for (const row of rows) {
      const [message] = await tx
        .insert(applicationMessages)
        .values({
          applicationId: row.id,
          senderProfileId: profile.id,
          senderType: "staff",
          visibility: "applicant",
          subject: template.subject,
          body: template.body,
        })
        .returning({ id: applicationMessages.id });
      await tx.insert(emailOutbox).values({
        templateKey: key,
        recipientEmail: row.email,
        recipientProfileId: row.ownerProfileId,
        applicationId: row.id,
        payload: {
          title: template.subject,
          message: template.body,
          reference: row.reference,
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal/messages`,
        },
        idempotencyKey: `bulk_message:${message.id}`,
      });
    }
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "approved bulk communication queued",
      entityType: "application_batch",
      afterRedacted: { template: key, count: rows.length },
      metadataRedacted: { applicationIds: ids },
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/applications");
}
