"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { auditLogs, emailOutbox, invitations } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function retryEmailAction(formData: FormData) {
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
