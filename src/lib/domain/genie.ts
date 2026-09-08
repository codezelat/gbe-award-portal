import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Only retain reconciliation fields. Card details and provider payloads are never stored.
export const genieTransactionSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  localId: z.string(),
  state: z.string(),
  merchantId: z.string(),
  originatorApp: z.string(),
  url: z.url().optional(),
  updated: z.string().optional(),
  history: z
    .array(z.object({ state: z.string(), updatedDate: z.string().nullish() }))
    .nullish(),
});
export type GenieTransaction = z.infer<typeof genieTransactionSchema>;
export function genieConfirmedAt(transaction: GenieTransaction, now: Date) {
  const value =
    transaction.history?.filter((item) => item.state === "CONFIRMED").at(-1)
      ?.updatedDate ?? transaction.updated;
  const date = value ? new Date(value) : now;
  return Number.isFinite(date.getTime()) &&
    date.getTime() <= now.getTime() + 300_000
    ? date
    : now;
}
export function paymentErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.name === "Error" &&
    !error.cause &&
    !error.message.startsWith("NEXT_") &&
    !error.message.startsWith("Failed query")
  )
    return error.message;
  return "Payment could not be checked. Please retry or contact support with your nomination reference.";
}
export function isGenieTerminalFailure(state: string) {
  return ["CANCELLED", "FAILED", "VOIDED"].includes(state);
}
export function verifyGenieSignature(headers: Headers, apiKey: string) {
  const nonce = headers.get("x-signature-nonce");
  const timestamp = headers.get("x-signature-timestamp");
  const signature = headers.get("x-signature");
  if (
    !nonce ||
    nonce.length > 200 ||
    !timestamp ||
    timestamp.length > 80 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHash("sha256")
    .update(`${nonce}${timestamp}${apiKey}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function assertGenieMatch(
  transaction: GenieTransaction,
  expected: {
    id: string;
    amountMinor: number;
    currency: string;
    appId: string;
    transactionId?: string | null;
  },
) {
  if (
    transaction.localId !== expected.id ||
    transaction.amount !== expected.amountMinor ||
    transaction.currency !== expected.currency ||
    transaction.originatorApp !== expected.appId ||
    (expected.transactionId && transaction.id !== expected.transactionId)
  )
    throw new Error(
      "The payment confirmation did not match this nomination. Contact support before paying again.",
    );
}

export function safeGenieCheckoutUrl(
  value: string,
  environment: "sandbox" | "production",
) {
  const url = new URL(value);
  const host =
    environment === "sandbox"
      ? "transaction.uat.geniebiz.lk"
      : "transaction.geniebiz.lk";
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error(
      "The payment provider returned an invalid checkout address.",
    );
  return url.href;
}
