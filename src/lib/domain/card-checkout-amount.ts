// Owner-approved live test. Set to null after the owner requests normal pricing.
export const CARD_TEST_AMOUNT_MINOR: number | null = 1000;

export function cardCheckoutAmount(feeMinor: number, currency: string) {
  return currency === "LKR" ? (CARD_TEST_AMOUNT_MINOR ?? feeMinor) : feeMinor;
}

// Keep the nomination fee snapshot for bank transfer. An existing attempt or
// settled amount always wins over today's temporary card checkout setting.
export function paymentDisplayAmount(
  payment: {
    method: string | null;
    amountMinor: number | null;
    expectedAmountMinor: number | null;
    currency: string | null;
  },
  activeAttemptAmount?: number | null,
) {
  if (payment.amountMinor !== null) return payment.amountMinor;
  const fee = payment.expectedAmountMinor ?? 0;
  if (payment.method !== "card" || !fee) return fee;
  return (
    activeAttemptAmount ?? cardCheckoutAmount(fee, payment.currency ?? "LKR")
  );
}
