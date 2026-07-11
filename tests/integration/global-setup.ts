import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

export default async function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!databaseUrl || !adminUrl)
    throw new Error(
      "TEST_DATABASE_URL and TEST_DATABASE_ADMIN_URL are required for integration tests.",
    );
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!/^gbe_award_portal_test(?:_[a-z0-9_]+)?$/.test(databaseName))
    throw new Error(
      "Refusing to recreate a database without the gbe_award_portal_test prefix.",
    );
  const admin = postgres(adminUrl, { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  const client = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
  await client.end();
  return async () => {
    const cleanup = postgres(adminUrl, { max: 1 });
    await cleanup.unsafe(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await cleanup.end();
  };
}
