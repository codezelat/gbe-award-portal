export const INVITE_VALIDITY_MS = 60 * 60 * 1000;
export const INVITE_BATCH_LIMIT = 100;
export type InviteSnapshot = {
  id: string;
  expiresAt: number;
  originalAmountMinor: number;
  amountMinor: number;
  currency: string;
  status: "active" | "expired" | "used" | "cancelled";
};

export function normaliseInviteCode(value: string) {
  return value.trim().toUpperCase();
}

export function inviteState(
  row: {
    draftId: string | null;
    revokedAt: Date | null;
    consumedAt: Date | null;
    expiresAt: Date | null;
  },
  now = Date.now(),
): "unused" | "active" | "used" | "expired" | "cancelled" {
  if (row.consumedAt) return "used";
  if (row.revokedAt) return "cancelled";
  if (!row.draftId) return "unused";
  return row.expiresAt && row.expiresAt.getTime() > now ? "active" : "expired";
}
