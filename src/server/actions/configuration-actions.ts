"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, ne } from "drizzle-orm";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import {
  auditLogs,
  awardCategories,
  awardCycles,
  systemSettings,
} from "@/lib/db/schema";
function requireConfig(membership: { role: string; permissions: unknown }) {
  if (!hasPermission(membership, "configuration.manage"))
    throw new Error("Settings permission is required.");
}
export async function createCycleAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  requireConfig(membership);
  const input = z
    .object({
      name: z.string().trim().min(2).max(180),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      year: z.coerce.number().int().min(2026).max(2200),
      opensAt: z.string(),
      closesAt: z.string(),
      heading: z.string().trim().min(2).max(240),
      introCopy: z.string().trim().min(10).max(1200),
      declarationText: z.string().trim().min(20),
      declarationVersion: z.string().min(1),
      termsVersion: z.string().min(1),
      privacyVersion: z.string().min(1),
    })
    .parse(Object.fromEntries(formData));
  const opensAt = new Date(input.opensAt),
    closesAt = new Date(input.closesAt);
  if (
    Number.isNaN(opensAt.valueOf()) ||
    Number.isNaN(closesAt.valueOf()) ||
    closesAt <= opensAt
  )
    throw new Error("The cycle closing time must be after its opening time.");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(awardCycles)
      .values({
        ...input,
        status: "draft",
        timezone: "Asia/Colombo",
        opensAt,
        closesAt,
        supportEmail: "info@gbeaward.com",
        formSchemaVersion: "2.0",
      })
      .returning({ id: awardCycles.id });
    const { cycleSequences } = await import("@/lib/db/schema");
    await tx.insert(cycleSequences).values({ cycleId: created.id });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "award cycle created",
      entityType: "award_cycle",
      entityId: created.id,
      afterRedacted: { name: input.name, year: input.year, status: "draft" },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
    return created;
  });
  revalidatePath("/admin/cycles");
}
export async function saveCategoryAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  requireConfig(membership);
  const input = z
    .object({
      id: z.union([z.literal(""), z.uuid()]).optional(),
      cycleId: z.uuid(),
      code: z.string().trim().min(2).max(40),
      name: z.string().trim().min(2).max(180),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/)
        .max(180),
      shortDescription: z.string().trim().max(500).optional(),
      internalNotes: z.string().trim().max(2000).optional(),
      displayOrder: z.coerce.number().int().min(0).max(10000),
      capacity: z
        .union([
          z.literal(""),
          z.coerce.number().int().positive().max(1_000_000),
        ])
        .optional(),
      feeOverrideMinor: z
        .union([z.literal(""), z.coerce.number().int().nonnegative()])
        .optional(),
      isActive: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));
  const values = {
    cycleId: input.cycleId,
    code: input.code,
    name: input.name,
    slug: input.slug,
    shortDescription: input.shortDescription || null,
    internalNotes: input.internalNotes || null,
    displayOrder: input.displayOrder,
    capacity: input.capacity === "" ? null : input.capacity,
    feeOverrideMinor:
      input.feeOverrideMinor === "" ? null : input.feeOverrideMinor,
    isActive: input.isActive === "on",
    updatedAt: new Date(),
  };
  const db = getDb();
  let id = input.id;
  let beforeSnapshot: Record<string, unknown> | null = null;
  await db.transaction(async (tx) => {
    if (id) {
      const [before] = await tx
        .select()
        .from(awardCategories)
        .where(eq(awardCategories.id, id))
        .limit(1);
      if (!before) throw new Error("Award category not found.");
      if (before.cycleId !== input.cycleId)
        throw new Error(
          "An existing category cannot be moved to another award cycle.",
        );
      beforeSnapshot = {
        code: before.code,
        name: before.name,
        slug: before.slug,
        shortDescription: before.shortDescription,
        internalNotes: before.internalNotes,
        displayOrder: before.displayOrder,
        isActive: before.isActive,
        capacity: before.capacity,
        feeOverrideMinor: before.feeOverrideMinor,
      };
      await tx
        .update(awardCategories)
        .set(values)
        .where(eq(awardCategories.id, id));
    } else {
      const [created] = await tx
        .insert(awardCategories)
        .values(values)
        .returning({ id: awardCategories.id });
      id = created.id;
    }
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "award category saved",
      entityType: "award_category",
      entityId: id,
      beforeRedacted: beforeSnapshot,
      afterRedacted: {
        code: input.code,
        name: input.name,
        slug: input.slug,
        shortDescription: input.shortDescription || null,
        internalNotes: input.internalNotes || null,
        displayOrder: input.displayOrder,
        isActive: values.isActive,
        capacity: values.capacity,
        feeOverrideMinor: values.feeOverrideMinor,
      },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/categories");
}
export async function saveCycleAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  requireConfig(membership);
  const input = z
    .object({
      id: z.uuid(),
      name: z.string().trim().min(2).max(180),
      heading: z.string().trim().min(2).max(240),
      introCopy: z.string().trim().min(10).max(1200),
      status: z.enum([
        "draft",
        "scheduled",
        "open",
        "closed",
        "reviewing",
        "results_pending",
        "completed",
        "archived",
      ]),
      opensAt: z.string(),
      closesAt: z.string(),
      resultsReleaseAt: z.string().optional(),
      supportEmail: z.email(),
      nominationFeeMinor: z.coerce.number().int().nonnegative().optional(),
      currency: z.string().length(3).optional(),
      declarationText: z.string().trim().min(20),
      declarationVersion: z.string().trim().min(1),
      termsVersion: z.string().trim().min(1),
      privacyVersion: z.string().trim().min(1),
    })
    .parse(Object.fromEntries(formData));
  const opensAt = new Date(input.opensAt),
    closesAt = new Date(input.closesAt);
  if (
    Number.isNaN(opensAt.valueOf()) ||
    Number.isNaN(closesAt.valueOf()) ||
    closesAt <= opensAt
  )
    throw new Error("The cycle closing time must be after its opening time.");
  const resultsReleaseAt = input.resultsReleaseAt
    ? new Date(input.resultsReleaseAt)
    : null;
  if (
    resultsReleaseAt &&
    (Number.isNaN(resultsReleaseAt.valueOf()) || resultsReleaseAt < closesAt)
  )
    throw new Error(
      "The results release time must be after nominations close.",
    );
  const [before] = await getDb()
    .select()
    .from(awardCycles)
    .where(eq(awardCycles.id, input.id))
    .limit(1);
  if (!before) throw new Error("Award cycle not found.");
  if (input.status === "open" && (!input.opensAt || !input.closesAt))
    throw new Error(
      "Opening and closing dates are required before opening submissions.",
    );
  if (input.status === "open" && before.status !== "open") {
    if (!hasPermission(membership, "cycles.activate"))
      throw new Error(
        "Only a super administrator can activate a production award cycle.",
      );
    const configured = await getDb()
      .select({ key: systemSettings.key })
      .from(systemSettings);
    const keys = new Set(configured.map((item) => item.key));
    if (!keys.has("legal_terms") || !keys.has("privacy_notice"))
      throw new Error(
        "Approved legal terms and privacy notice must be configured before opening submissions.",
      );
    const [[categoryCount], [otherOpen]] = await Promise.all([
      getDb()
        .select({ value: count() })
        .from(awardCategories)
        .where(
          and(
            eq(awardCategories.cycleId, input.id),
            eq(awardCategories.isActive, true),
          ),
        ),
      getDb()
        .select({ value: count() })
        .from(awardCycles)
        .where(
          and(eq(awardCycles.status, "open"), ne(awardCycles.id, input.id)),
        ),
    ]);
    if (!categoryCount.value)
      throw new Error(
        "At least one active award category is required before opening submissions.",
      );
    if (otherOpen.value)
      throw new Error(
        "Another award cycle is already open. Close it before activating this cycle.",
      );
  }
  const { id, ...values } = input;
  await getDb().transaction(async (tx) => {
    await tx
      .update(awardCycles)
      .set({
        ...values,
        opensAt,
        closesAt,
        resultsReleaseAt,
        currency: input.currency?.toUpperCase() || null,
        updatedAt: new Date(),
      })
      .where(eq(awardCycles.id, id));
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "award cycle saved",
      entityType: "award_cycle",
      entityId: input.id,
      beforeRedacted: {
        status: before.status,
        name: before.name,
        heading: before.heading,
        opensAt: before.opensAt.toISOString(),
        closesAt: before.closesAt.toISOString(),
        resultsReleaseAt: before.resultsReleaseAt?.toISOString() ?? null,
        supportEmail: before.supportEmail,
        nominationFeeMinor: before.nominationFeeMinor,
        currency: before.currency,
        declarationVersion: before.declarationVersion,
        termsVersion: before.termsVersion,
        privacyVersion: before.privacyVersion,
      },
      afterRedacted: {
        status: input.status,
        name: input.name,
        heading: input.heading,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        resultsReleaseAt: resultsReleaseAt?.toISOString() ?? null,
        supportEmail: input.supportEmail,
        nominationFeeMinor: input.nominationFeeMinor ?? null,
        currency: input.currency?.toUpperCase() || null,
        declarationVersion: input.declarationVersion,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
      },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/cycles");
  revalidatePath("/apply");
}
const allowedSettings = new Set([
  "support_contact",
  "bank_instructions",
  "invitation_expiry_hours",
  "export_retention_hours",
  "upload_retention_hours",
  "invitation_reminder_hours",
  "superseded_file_retention_hours",
  "feature_flags",
  "email_templates",
  "brand_asset_keys",
  "legal_terms",
  "privacy_notice",
]);
export async function saveSettingAction(formData: FormData) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "settings.manage"))
    throw new Error("System settings permission is required.");
  const key = z.string().parse(formData.get("key"));
  if (!allowedSettings.has(key))
    throw new Error("This setting cannot be changed here.");
  const raw = z.string().max(10000).parse(formData.get("value"));
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  if (key === "feature_flags")
    value = z
      .object({
        applications_enabled: z.boolean().optional(),
        applicant_messages_enabled: z.boolean().optional(),
        profile_social_fields_enabled: z.boolean().optional(),
        outcome_visibility_enabled: z.boolean().optional(),
        analytics_enabled: z.boolean().optional(),
        excel_exports_enabled: z.boolean().optional(),
        csv_exports_enabled: z.boolean().optional(),
      })
      .strip()
      .parse(value);
  if (key === "email_templates")
    value = z
      .record(
        z.string().min(1).max(100),
        z
          .object({
            title: z.string().trim().min(2).max(180).optional(),
            message: z.string().trim().min(2).max(1000).optional(),
            actionLabel: z.string().trim().min(2).max(80).optional(),
          })
          .strict(),
      )
      .parse(value);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    await tx
      .insert(systemSettings)
      .values({ key, value, updatedBy: profile.id })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedBy: profile.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "system setting saved",
      entityType: "system_setting",
      beforeRedacted: { key, value: before?.value ?? null },
      afterRedacted: { key, value },
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
  revalidatePath("/admin/settings");
}
