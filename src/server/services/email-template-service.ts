import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import {
  emailTemplateDefaults,
  type EmailTemplateCopy,
} from "@/lib/domain/email-templates";

export async function getEmailTemplateCopies() {
  const [setting] = await getDb()
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "email_templates"))
    .limit(1);
  const overrides =
    setting?.value && typeof setting.value === "object"
      ? (setting.value as Record<string, Partial<EmailTemplateCopy>>)
      : {};
  return Object.fromEntries(
    Object.entries(emailTemplateDefaults).map(([key, defaults]) => [
      key,
      { ...defaults, ...(overrides[key] ?? {}) },
    ]),
  ) as Record<string, EmailTemplateCopy>;
}
