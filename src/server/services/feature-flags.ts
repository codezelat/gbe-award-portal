import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

export const defaultFeatureFlags = {
  applications_enabled: true,
  applicant_messages_enabled: true,
  profile_social_fields_enabled: false,
  outcome_visibility_enabled: true,
  analytics_enabled: false,
  excel_exports_enabled: true,
  csv_exports_enabled: true,
} as const;

export type FeatureFlag = keyof typeof defaultFeatureFlags;

export async function getFeatureFlags(): Promise<Record<FeatureFlag, boolean>> {
  const [setting] = await getDb()
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "feature_flags"))
    .limit(1);
  const configured =
    setting?.value && typeof setting.value === "object"
      ? (setting.value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(defaultFeatureFlags).map(([key, fallback]) => [
      key,
      typeof configured[key] === "boolean" ? configured[key] : fallback,
    ]),
  ) as Record<FeatureFlag, boolean>;
}

export async function requireFeatureFlag(flag: FeatureFlag) {
  const flags = await getFeatureFlags();
  if (!flags[flag]) throw new Error("This feature is temporarily unavailable.");
}

export async function requireExportFormat(format: "xlsx" | "csv") {
  await requireFeatureFlag(
    format === "xlsx" ? "excel_exports_enabled" : "csv_exports_enabled",
  );
}
