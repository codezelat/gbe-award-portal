import { z } from "zod";
import { turnstileActions } from "@/config/turnstile";

const serverSchema = z.object({
  APP_ENV: z
    .enum(["local", "preview", "staging", "production"])
    .default("local"),
  APP_TIMEZONE: z.string().default("Asia/Colombo"),
  SUPPORT_EMAIL: z.email().default("info@gbeaward.com"),
  OFFICIAL_SITE_URL: z.url().default("https://gbeaward.com"),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_DIRECT: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.url().optional(),
  R2_PRIVATE_BUCKET: z.string().default("gbe-portal-private"),
  R2_PUBLIC_BUCKET: z.string().default("gbe-portal-public"),
  R2_OBJECT_PREFIX: z.string().trim().optional(),
  R2_PUBLIC_ASSET_BASE_URL: z.url().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().default("localhost"),
  TURNSTILE_APPLICATION_ACTION: z
    .string()
    .default(turnstileActions.nomination),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default("GBE Awards <info@gbeaward.com>"),
  EMAIL_REPLY_TO: z.email().default("info@gbeaward.com"),
  CRON_SECRET: z.string().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z
    .string()
    .default("1x00000000000000000000AA"),
});

export const env = serverSchema.parse(process.env);
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
});

export function requireProvider(name: "database" | "r2" | "auth" | "email") {
  const configured = {
    database: Boolean(env.DATABASE_URL),
    r2: Boolean(
      env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY,
    ),
    auth: Boolean(env.DATABASE_URL && env.BETTER_AUTH_SECRET),
    email: Boolean(env.RESEND_API_KEY),
  }[name];
  if (!configured) throw new Error(`${name.toUpperCase()}_NOT_CONFIGURED`);
}
