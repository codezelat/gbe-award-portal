import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  assertGenieMatch,
  isGenieTerminalFailure,
  safeGenieCheckoutUrl,
  verifyGenieSignature,
  genieConfirmedAt,
} from "@/lib/domain/genie";
import { initiateApplicationSchema } from "@/lib/validation/application";
import { declarationText } from "@/config/brand";
import { missingPaymentVerificationFields } from "@/lib/domain/payment-verification";

describe("Genie trust boundary", () => {
  const remote = {
    id: "a".repeat(24),
    localId: "attempt",
    amount: 6500000,
    currency: "LKR",
    state: "CONFIRMED",
    merchantId: "merchant",
    originatorApp: "app",
  };
  const expected = {
    id: "attempt",
    amountMinor: 6500000,
    currency: "LKR",
    appId: "app",
    transactionId: "a".repeat(24),
  };
  it("uses the actual confirmation date when recovering a delayed payment", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const confirmed = "2026-09-08T10:00:00Z";
    expect(
      genieConfirmedAt(
        {
          ...remote,
          history: [{ state: "CONFIRMED", updatedDate: confirmed }],
        },
        now,
      ).toISOString(),
    ).toBe(new Date(confirmed).toISOString());
    expect(genieConfirmedAt({ ...remote, updated: "invalid" }, now)).toBe(now);
    expect(genieConfirmedAt({ ...remote, updated: "2099-01-01" }, now)).toBe(
      now,
    );
  });
  it("requires a matching amount, currency, local reference, application and transaction", () => {
    expect(() => assertGenieMatch(remote, expected)).not.toThrow();
    for (const patch of [
      { amount: 5500000 },
      { currency: "USD" },
      { localId: "another" },
      { originatorApp: "other" },
      { id: "b".repeat(24) },
    ])
      expect(() =>
        assertGenieMatch({ ...remote, ...patch }, expected),
      ).toThrow();
  });
  it("checks the documented SHA-256 header signature", () => {
    const headers = new Headers({
      "X-Signature-Nonce": "n",
      "X-Signature-Timestamp": "t",
      "X-Signature": createHash("sha256").update("nttest-secret").digest("hex"),
    });
    expect(verifyGenieSignature(headers, "test-secret")).toBe(true);
    expect(verifyGenieSignature(headers, "wrong")).toBe(false);
    headers.set("X-Signature", "bad");
    expect(verifyGenieSignature(headers, "test-secret")).toBe(false);
    expect(verifyGenieSignature(new Headers(), "test-secret")).toBe(false);
  });
  it("never treats pending or authorised transactions as a safe failed checkout", () => {
    for (const state of [
      "INITIATED",
      "QR_CODE_GENERATED",
      "AUTHORIZED",
      "UNKNOWN",
      "CONFIRMED",
      "REFUND_REQUESTED",
    ])
      expect(isGenieTerminalFailure(state)).toBe(false);
    for (const state of ["FAILED", "CANCELLED", "VOIDED"])
      expect(isGenieTerminalFailure(state)).toBe(true);
  });
  it("restricts checkout redirects to the correct environment", () => {
    expect(
      safeGenieCheckoutUrl(
        "https://transaction.uat.geniebiz.lk/test",
        "sandbox",
      ),
    ).toContain("/test");
    for (const url of [
      "https://evil.example/test",
      "http://transaction.uat.geniebiz.lk/test",
      "https://transaction.uat.geniebiz.lk.evil.example/test",
      "https://user@transaction.uat.geniebiz.lk/test",
      "https://transaction.geniebiz.lk/test",
    ])
      expect(() => safeGenieCheckoutUrl(url, "sandbox")).toThrow();
  });
});

describe("payment proof requirements", () => {
  const input = {
    nomineeName: "Test nomination",
    awardNomination: "A valid test award nomination",
    email: "test@example.test",
    phone: "+94771234567",
    categoryId: crypto.randomUUID(),
    declarationAccepted: true,
    declarationText,
    turnstileToken: "test",
    honeypot: "",
    startedAt: Date.now(),
    idempotencyKey: crypto.randomUUID(),
    files: [],
  };
  it("accepts card without a proof and still requires bank proof", () => {
    expect(
      initiateApplicationSchema.safeParse({ ...input, paymentMethod: "card" })
        .success,
    ).toBe(true);
    expect(initiateApplicationSchema.safeParse(input).success).toBe(false);
    const proof = {
      id: crypto.randomUUID(),
      name: "proof.pdf",
      size: 100,
      type: "application/pdf",
      kind: "payment_proof",
    };
    expect(
      initiateApplicationSchema.safeParse({ ...input, files: [proof] }).success,
    ).toBe(true);
    expect(
      initiateApplicationSchema.safeParse({
        ...input,
        paymentMethod: "card",
        files: [proof],
      }).success,
    ).toBe(false);
  });
  it("accepts retained gateway evidence without changing legacy proof rules", () => {
    const record = {
      applicationReference: "GBE-2026-123456",
      applicationSubmittedAt: new Date(),
      paymentReference: "PAY-1",
      proofApplicationFileId: null,
      payerName: null,
      bankReference: null,
      amountMinor: 6500000,
      currency: "LKR",
      paidAt: new Date(),
    };
    expect(missingPaymentVerificationFields(record)).toContain("payment proof");
    expect(
      missingPaymentVerificationFields({
        ...record,
        gatewayTransactionId: "txn",
      }),
    ).toEqual([]);
  });
});
