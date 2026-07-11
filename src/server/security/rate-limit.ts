import "server-only";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";

const local = new Map<string, { count: number; reset: number }>();
export async function enforceRateLimit(
  key: string,
  limit = 5,
  windowSeconds = 600,
) {
  if (env.DATABASE_URL) {
    const result = await getDb().execute(sql<{
      count: number;
    }>`
      insert into rate_limit_buckets (key, count, reset_at, updated_at)
      values (${key}, 1, now() + (${windowSeconds} * interval '1 second'), now())
      on conflict (key) do update set
        count = case
          when rate_limit_buckets.reset_at <= now() then 1
          else rate_limit_buckets.count + 1
        end,
        reset_at = case
          when rate_limit_buckets.reset_at <= now()
          then now() + (${windowSeconds} * interval '1 second')
          else rate_limit_buckets.reset_at
        end,
        updated_at = now()
      returning count
    `);
    if (Number(result.rows[0]?.count ?? 1) > limit)
      throw new Error("Too many attempts. Please wait before trying again.");
    return;
  }
  if (env.APP_ENV === "production")
    throw new Error("Submission protection is temporarily unavailable.");
  const now = Date.now();
  const current = local.get(key);
  if (!current || current.reset < now) {
    local.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    return;
  }
  if (current.count >= limit)
    throw new Error("Too many attempts. Please wait before trying again.");
  current.count += 1;
}
