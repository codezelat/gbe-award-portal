import "dotenv/config";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  E2E_DATABASE_NAME,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_APPLICATION_REFERENCE,
  databaseUrlFor,
  e2eDatabaseUrl,
  e2eRuntimeDatabaseUrl,
} from "./database";

export default async function setup() {
  const admin = postgres(databaseUrlFor("neondb"), { max: 1 });
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${E2E_DATABASE_NAME}" WITH (FORCE)`,
  );
  await admin.unsafe(`CREATE DATABASE "${E2E_DATABASE_NAME}"`);
  await admin.end();

  const testUrl = e2eDatabaseUrl();
  const client = postgres(testUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
  await client.end();

  execFileSync("bun", ["--conditions=react-server", "scripts/seed.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      DATABASE_URL_DIRECT: testUrl,
      SEED_CYCLE_OPENS_AT: "2026-01-01T00:00:00.000Z",
      SEED_CYCLE_CLOSES_AT: "2026-12-31T23:59:59.999Z",
    },
    stdio: "inherit",
  });

  const seeded = postgres(testUrl, { max: 1 });
  await seeded`
    update award_cycles
    set status = 'open', updated_at = now()
    where slug = 'gbe-awards-2026'
  `;
  await seeded`
    with fixture as (
      select
        c.id as cycle_id,
        c.declaration_text,
        c.declaration_version,
        c.terms_version,
        c.privacy_version,
        c.form_schema_version,
        cat.id as category_id,
        cat.name as category_name,
        cat.code as category_code
      from award_cycles c
      join award_categories cat on cat.cycle_id = c.id
      where c.slug = 'gbe-awards-2026'
      order by cat.display_order
      limit 1
    )
    insert into applications (
      reference, cycle_id, category_id, workflow_status, payment_status,
      account_access_status, nominee_name, industry_sector, email_normalised,
      email_display, phone_e164, phone_display, category_name_snapshot,
      category_code_snapshot, declaration_accepted, declaration_text_snapshot,
      declaration_version, terms_version, privacy_version, form_schema_version,
      submitted_at, last_activity_at
    )
    select
      ${E2E_APPLICATION_REFERENCE}, cycle_id, category_id, 'submitted',
      'proof_submitted', 'not_created', 'Playwright Fixture Organisation',
      'Technology', 'fixture@example.test', 'fixture@example.test',
      '+94771234567', '+94 77 123 4567', category_name, category_code, true,
      declaration_text, declaration_version, terms_version, privacy_version,
      form_schema_version, now(), now()
    from fixture
  `;
  const runtimeRole = new URL(e2eRuntimeDatabaseUrl()).username;
  if (!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole))
    throw new Error("The Playwright runtime database role is invalid.");
  await seeded.unsafe(
    `GRANT CONNECT ON DATABASE "${E2E_DATABASE_NAME}" TO "${runtimeRole}"`,
  );
  await seeded.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
  await seeded.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${runtimeRole}"`,
  );
  await seeded.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${runtimeRole}"`,
  );
  await seeded.end();

  execFileSync(
    "bun",
    ["--conditions=react-server", "scripts/bootstrap-admin.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        DATABASE_URL_DIRECT: testUrl,
        BETTER_AUTH_URL: "http://localhost:3100",
        RESEND_API_KEY: "",
        BOOTSTRAP_ADMIN_NAME: "Playwright Administrator",
        BOOTSTRAP_ADMIN_EMAIL: E2E_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_PASSWORD: E2E_ADMIN_PASSWORD,
      },
      stdio: "inherit",
    },
  );
}
