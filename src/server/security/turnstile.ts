import "server-only";
import { env } from "@/lib/env";

type TurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};
const officialAlwaysPassesSecret = "1x0000000000000000000000000000000AA";
export async function verifyTurnstile(token: string, remoteIp?: string) {
  if (!env.TURNSTILE_SECRET_KEY)
    throw new Error("Security verification is not configured.");
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Security verification is temporarily unavailable. Please try again.",
    );
  const result = (await response.json()) as TurnstileResult;
  if (
    env.APP_ENV !== "production" &&
    env.TURNSTILE_SECRET_KEY === officialAlwaysPassesSecret &&
    result.success &&
    result.hostname === "example.com" &&
    result.metadata?.result_with_testing_key === true
  )
    return;
  const allowedHosts = env.TURNSTILE_EXPECTED_HOSTNAME.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    !result.success ||
    !result.hostname ||
    !allowedHosts.includes(result.hostname.toLowerCase()) ||
    result.action !== env.TURNSTILE_APPLICATION_ACTION
  )
    throw new Error(
      "Security verification expired or could not be confirmed. Please verify again.",
    );
}
