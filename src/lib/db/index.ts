import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env, requireProvider } from "@/lib/env";
import * as schema from "./schema";

function createDb() {
  requireProvider("database");
  const host = new URL(env.DATABASE_URL!).hostname;
  if (env.APP_ENV === "local" && ["localhost", "127.0.0.1"].includes(host)) {
    // The local payment test runner provides a loopback-only Postgres WebSocket bridge.
    neonConfig.wsProxy = () => "127.0.0.1:5433";
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
  return drizzle(new Pool({ connectionString: env.DATABASE_URL! }), { schema });
}
let database: ReturnType<typeof createDb> | undefined;
export function getDb() {
  return (database ??= createDb());
}
export type Database = ReturnType<typeof createDb>;
