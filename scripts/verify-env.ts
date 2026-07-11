import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  APP_ENV: z.enum(["local", "preview", "staging", "production"]),
  APP_TIMEZONE: z.literal("Asia/Colombo"),
  SUPPORT_EMAIL: z.literal("info@gbeaward.com"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  R2_ENDPOINT: z.url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_PRIVATE_BUCKET: z.string().min(1),
  R2_PUBLIC_BUCKET: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().min(1),
  TURNSTILE_APPLICATION_ACTION: z.literal("gbe_nomination_submit"),
  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1),
  EMAIL_REPLY_TO: z.email(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(24),
});
const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Environment verification failed:");
  for (const issue of result.error.issues)
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}
const url = new URL(result.data.NEXT_PUBLIC_APP_URL);
if (result.data.APP_ENV === "production" && url.protocol !== "https:") {
  console.error("- NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  process.exit(1);
}
if (result.data.BETTER_AUTH_URL !== result.data.NEXT_PUBLIC_APP_URL) {
  console.error("- BETTER_AUTH_URL must exactly match NEXT_PUBLIC_APP_URL.");
  process.exit(1);
}
if (result.data.DATABASE_URL === result.data.DATABASE_URL_DIRECT) {
  console.error(
    "- Runtime and migration-owner database URLs must use separate roles.",
  );
  process.exit(1);
}
if (result.data.R2_PRIVATE_BUCKET === result.data.R2_PUBLIC_BUCKET) {
  console.error(
    "- Private uploads and public brand assets require separate R2 buckets.",
  );
  process.exit(1);
}
if (result.data.APP_ENV === "production") {
  const testSite = "1x00000000000000000000AA",
    testSecret = "1x0000000000000000000000000000000AA";
  if (
    result.data.NEXT_PUBLIC_TURNSTILE_SITE_KEY === testSite ||
    result.data.TURNSTILE_SECRET_KEY === testSecret
  ) {
    console.error(
      "- Cloudflare Turnstile test keys cannot be deployed to production.",
    );
    process.exit(1);
  }
  if (
    process.env.BOOTSTRAP_ADMIN_NAME ||
    process.env.BOOTSTRAP_ADMIN_EMAIL ||
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  ) {
    console.error(
      "- Remove all BOOTSTRAP_ADMIN_* values after first-user setup.",
    );
    process.exit(1);
  }
}
if (
  Boolean(result.data.UPSTASH_REDIS_REST_URL) !==
  Boolean(result.data.UPSTASH_REDIS_REST_TOKEN)
) {
  console.error(
    "- Configure both Upstash values or neither; Neon provides the durable fallback.",
  );
  process.exit(1);
}
console.log(
  `Environment verified for ${result.data.APP_ENV} (${url.hostname}).`,
);
