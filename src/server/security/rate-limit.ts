import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env";

const local = new Map<string, { count: number; reset: number }>();
export async function enforceRateLimit(key: string, limit = 5, windowSeconds = 600) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const limiter = new Ratelimit({ redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }), limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`), prefix: "gbe-portal" });
    if (!(await limiter.limit(key)).success) throw new Error("Too many attempts. Please wait before trying again.");
    return;
  }
  if (env.APP_ENV === "production") throw new Error("Submission protection is temporarily unavailable.");
  const now = Date.now(); const current = local.get(key);
  if (!current || current.reset < now) { local.set(key, { count: 1, reset: now + windowSeconds * 1000 }); return; }
  if (current.count >= limit) throw new Error("Too many attempts. Please wait before trying again.");
  current.count += 1;
}
