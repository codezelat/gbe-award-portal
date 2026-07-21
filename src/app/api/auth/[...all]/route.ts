import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { profiles } from "@/lib/db/schema";
import { turnstileActions } from "@/config/turnstile";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import { verifyTurnstile } from "@/server/security/turnstile";
import {
  clearRateLimitBucket,
  getRateLimitBucketCount,
  incrementRateLimitBucket,
} from "@/server/security/rate-limit";

export const runtime = "nodejs";

const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const LOGIN_TURNSTILE_THRESHOLD = 2;

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  );
}

function loginFailureKey(request: Request, email: string) {
  const fingerprint = createHmac("sha256", env.BETTER_AUTH_SECRET!)
    .update(`${requestIp(request)}\u0000${email.trim().toLowerCase()}`)
    .digest("base64url");
  return `login-failure:${fingerprint}`;
}

async function getSignInEmail(request: Request) {
  try {
    const clone = request.clone();
    const contentType = clone.headers.get("content-type") ?? "";
    const email = contentType.includes("application/json")
      ? (await clone.json()).email
      : (await clone.formData()).get("email");
    return typeof email === "string" && email.trim() ? email : null;
  } catch {
    return null;
  }
}

function turnstileRequiredResponse(status = 403) {
  return NextResponse.json(
    {
      code: "TURNSTILE_REQUIRED",
      message: "Complete the security verification to continue.",
    },
    {
      status,
      headers: { "X-Login-Turnstile": "required" },
    },
  );
}

function isEmailSignIn(request: Request) {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname.endsWith("/sign-in/email")
  );
}

async function handler(request: Request) {
  try {
    scheduleEmailOutboxProcessing();
    const auth = getAuth();
    if (isEmailSignIn(request)) {
      const email = await getSignInEmail(request);
      const key = email ? loginFailureKey(request, email) : null;
      const previousFailures = key
        ? await getRateLimitBucketCount(key)
        : 0;
      if (previousFailures >= LOGIN_TURNSTILE_THRESHOLD) {
        const token = request.headers.get("x-captcha-response");
        if (!token) return turnstileRequiredResponse();
        try {
          await verifyTurnstile(
            token,
            requestIp(request),
            turnstileActions.login,
          );
        } catch {
          return turnstileRequiredResponse();
        }
      }
      const response = await auth.handler(request);
      if (!key) return response;
      if (response.ok) {
        await clearRateLimitBucket(key);
        return response;
      }
      if (response.status !== 401) return response;
      const failures = await incrementRateLimitBucket(
        key,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      return failures >= LOGIN_TURNSTILE_THRESHOLD
        ? turnstileRequiredResponse(response.status)
        : response;
    }
    if (
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/two-factor/enable")
    ) {
      const session = await auth.api.getSession({ headers: request.headers });
      const [profile] = session
        ? await getDb()
            .select({ accountKind: profiles.accountKind })
            .from(profiles)
            .where(eq(profiles.authUserId, session.user.id))
            .limit(1)
        : [];
      if (profile?.accountKind !== "staff")
        return NextResponse.json(
          { message: "Two-factor authentication is available to staff only." },
          { status: 403 },
        );
    }
    return auth.handler(request);
  } catch {
    return NextResponse.json(
      { message: "Authentication is not configured." },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
