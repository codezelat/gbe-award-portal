import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { saveSettingAction } from "@/server/actions/configuration-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { defaultFeatureFlags } from "@/server/services/feature-flags";
const supported = [
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
];
const structuredSettingKeys = new Set([
  "feature_flags",
  "email_templates",
  "brand_asset_keys",
  "legal_terms",
  "privacy_notice",
]);
export default async function SettingsPage() {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "settings.manage")) notFound();
  const rows = await getDb()
    .select()
    .from(systemSettings)
    .orderBy(asc(systemSettings.key));
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return (
    <>
      <h1 className="page-heading">Settings</h1>
      <p className="mt-2 text-graphite">
        Audited operational settings. Credentials and provider secrets never
        belong here.
      </p>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {supported.map((key) => (
          <form
            key={key}
            action={saveSettingAction}
            className="surface rounded-lg p-5"
          >
            <input type="hidden" name="key" value={key} />
            <label className="text-sm font-semibold" htmlFor={key}>
              {key.replaceAll("_", " ")}
            </label>
            <Textarea
              id={key}
              name="value"
              defaultValue={
                typeof map.get(key) === "string"
                  ? String(map.get(key))
                  : map.has(key) || structuredSettingKeys.has(key)
                    ? JSON.stringify(
                        map.get(key) ??
                          (key === "feature_flags" ? defaultFeatureFlags : {}),
                        null,
                        2,
                      )
                    : ""
              }
              className="mt-3 min-h-32 bg-white font-mono text-xs"
            />
            <Button size="sm" className="mt-3">
              Save setting
            </Button>
          </form>
        ))}
      </div>
    </>
  );
}
