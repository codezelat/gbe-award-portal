import { describe, expect, it } from "vitest";
import { cardCheckoutAmount, paymentDisplayAmount } from "@/lib/domain/card-checkout-amount";

describe("temporary card checkout amount", () => {
  const payment = { method: "card", amountMinor: null, expectedAmountMinor: 6500000, currency: "LKR" };
  it("charges LKR 10 only for a new LKR card checkout", () => {
    expect(cardCheckoutAmount(6500000, "LKR")).toBe(1000);
    expect(cardCheckoutAmount(6500000, "USD")).toBe(6500000);
    expect(paymentDisplayAmount(payment)).toBe(1000);
  });
  it("retains bank transfer, legacy and active checkout amounts", () => {
    expect(paymentDisplayAmount({ ...payment, method: "bank_transfer" })).toBe(6500000);
    expect(paymentDisplayAmount({ ...payment, method: null, amountMinor: 5500000 })).toBe(5500000);
    expect(paymentDisplayAmount(payment, 6500000)).toBe(6500000);
    expect(paymentDisplayAmount({ ...payment, expectedAmountMinor: null })).toBe(0);
  });
  it("always shows the actual settled amount, including after price rollback", () => {
    expect(paymentDisplayAmount({ ...payment, amountMinor: 1000 }, 6500000)).toBe(1000);
    expect(paymentDisplayAmount({ ...payment, amountMinor: 6500000 })).toBe(6500000);
    expect(paymentDisplayAmount({ ...payment, amountMinor: 0 })).toBe(0);
  });
});
