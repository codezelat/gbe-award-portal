"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import { nonDeletedApplications } from "@/server/dal/application-visibility";
import {
  applications,
  auditLogs,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";

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
          isNull(staffMemberships.suspendedAt),
        ),
      )
      .limit(1);
    if (!reviewer) throw new Error("The selected staff member is not active.");
  }
  await db.transaction(async (tx) => {
    const scoped = await tx
      .select({
        id: applications.id,
        assignedReviewerId: applications.assignedReviewerId,
      })
      .from(applications)
      .where(nonDeletedApplications(inArray(applications.id, ids)))
      .orderBy(applications.id)
      .for("update");
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
      .where(nonDeletedApplications(inArray(applications.id, ids)));
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
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
}
