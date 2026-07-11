import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env, requireProvider } from "@/lib/env";
import * as schema from "./schema";

function createDb() {
  requireProvider("database");
  return drizzle(new Pool({ connectionString: env.DATABASE_URL! }), { schema });
}
let database: ReturnType<typeof createDb> | undefined;
export function getDb() {
  return (database ??= createDb());
}
export type Database = ReturnType<typeof createDb>;
