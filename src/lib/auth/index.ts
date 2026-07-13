import "server-only";
import { betterAuth } from "better-auth";
import { admin, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env, requireProvider } from "@/lib/env";

function createAuth() {
  return betterAuth({
    appName: "GBE Awards Portal",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const { emailOutbox } = await import("@/lib/db/schema");
        await getDb()
          .insert(emailOutbox)
          .values({
            templateKey: "email_verification",
            recipientEmail: user.email,
            payload: { name: user.name, url },
            idempotencyKey: `email_verification:${user.id}:${crypto.randomUUID()}`,
          });
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { emailOutbox } = await import("@/lib/db/schema");
        await getDb()
          .insert(emailOutbox)
          .values({
            templateKey: "password_reset",
            recipientEmail: user.email,
            payload: { name: user.name, url },
            idempotencyKey: `password_reset:${user.id}:${crypto.randomUUID()}`,
          });
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    rateLimit: { enabled: true, window: 60, max: 10 },
    advanced: {
      useSecureCookies: env.APP_ENV === "production",
      cookiePrefix: "gbe_portal",
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      twoFactor({ issuer: "GBE Awards Portal" }),
      nextCookies(),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  requireProvider("auth");
  return (instance ??= createAuth());
}
