import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { TICKET_DETAILS_MS } from "@/lib/domain/ticket-timing";
type Details = {
  salesId: string;
  quantity: number;
  acceptedUnitPriceMinor: number;
  expiresAt: number;
};
export async function createTicketDetailsSession(
  input: Omit<Details, "expiresAt">,
) {
  const now = Date.now();
  const expiresAt = now + TICKET_DETAILS_MS;
  return {
    now,
    expiresAt,
    signature: signTicketDetails({ ...input, expiresAt }),
  };
}
export function signTicketDetails(input: Details) {
  if (!env.BETTER_AUTH_SECRET)
    throw new Error("Ticket access is not configured.");
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(
      `guest-ticket-details:v1:${input.salesId}:${input.quantity}:${input.acceptedUnitPriceMinor}:${input.expiresAt}`,
    )
    .digest("hex");
}
export function verifyTicketDetails(
  input: Details,
  signature: string,
  now = Date.now(),
) {
  return (
    input.expiresAt > now &&
    input.expiresAt <= now + TICKET_DETAILS_MS &&
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(signTicketDetails(input), "hex"),
    )
  );
}
