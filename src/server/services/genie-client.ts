import "server-only";
import { env, publicEnv } from "@/lib/env";
import { genieTransactionSchema } from "@/lib/domain/genie";

export class GenieRequestRejected extends Error {}

export function requireGenie() {
  if (env.GENIE_ENABLED !== "true" || !env.GENIE_API_KEY || !env.GENIE_APP_ID)
    throw new Error(
      "Card payments are temporarily unavailable. Please use bank transfer or try again later.",
    );
  if (env.APP_ENV === "production" && env.GENIE_ENVIRONMENT !== "production")
    throw new Error("Card payments are not configured for production.");
}
export function genieAvailable() {
  try {
    requireGenie();
    return true;
  } catch {
    return false;
  }
}
async function request(path: string, body?: object) {
  requireGenie();
  const host =
    env.GENIE_ENVIRONMENT === "sandbox"
      ? "https://api.uat.geniebiz.lk"
      : "https://api.geniebiz.lk";
  const response = await fetch(`${host}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: env.GENIE_API_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Explicit validation/authentication failures did not create a checkout.
    if (body && [400, 401, 403, 404, 422].includes(response.status))
      throw new GenieRequestRejected(
        "Card checkout is unavailable. Please use bank transfer or contact support.",
      );
    throw new Error(
      "Genie could not confirm this request. Check payment status before trying again.",
    );
  }
  return genieTransactionSchema.parse(await response.json());
}
export function getGenieTransaction(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id))
    throw new Error("Invalid payment transaction.");
  return request(`/public/transactions/${id}`);
}
export function createGenieTransaction(input: {
  id: string;
  applicationId: string;
  amountMinor: number;
  currency: string;
  expiresAt: Date;
}) {
  const returnUrl = new URL(
    `/apply/payment/${input.applicationId}`,
    publicEnv.NEXT_PUBLIC_APP_URL,
  ).href;
  const webhookBase =
    env.GENIE_WEBHOOK_BASE_URL ?? publicEnv.NEXT_PUBLIC_APP_URL;
  return request("/public/v2/transactions", {
    amount: input.amountMinor,
    currency: input.currency,
    localId: input.id,
    redirectUrl: returnUrl,
    paymentAttemptFailureUrl: returnUrl,
    webhook: new URL("/api/webhooks/genie", webhookBase).href,
    expires: input.expiresAt.toISOString(),
    provider: "card_payments",
    allowRetry: false,
    paymentPortalExperience: { skipProviderSelection: true },
  });
}
