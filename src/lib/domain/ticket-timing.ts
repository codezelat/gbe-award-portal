export const TICKET_DETAILS_MS = 5 * 60_000;
export const TICKET_CHECKOUT_MS = 15 * 60_000;
export function ticketTimeLeft(expiresAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
