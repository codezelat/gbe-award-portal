import "dotenv/config";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  E2E_DATABASE_NAME,
  databaseUrlFor,
  e2eDatabaseUrl,
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
  await seeded.end();
}
