import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/domain/application-status";
import {
  canPurgeIncompletePaymentShell,
  missingPaymentVerificationFields,
  paymentVerificationError,
} from "@/lib/domain/payment-verification";
import {
  exportFilename,
  neutraliseSpreadsheetCell,
} from "@/server/services/export-service";
describe("business rules", () => {
  it("allows only defined status transitions", () => {
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("winner", "submitted")).toBe(false);
  });
  it("neutralises spreadsheet formulas", () => {
    expect(neutraliseSpreadsheetCell("=CMD()")).toBe("'=CMD()");
    expect(neutraliseSpreadsheetCell("A normal value")).toBe("A normal value");
  });
  it("creates meaningful export names", () =>
    expect(
      exportFilename("Payment reconciliation", "xlsx", new Date("2026-07-11")),
    ).toBe("gbe-payment-reconciliation-2026-07-11.xlsx"));
  it("blocks verification until a completed nomination has complete payment evidence", () => {
    const incomplete = {
      applicationReference: null,
      applicationSubmittedAt: null,
      paymentReference: null,
      proofApplicationFileId: null,
      payerName: null,
      bankReference: null,
      amountMinor: null,
      currency: null,
      paidAt: null,
    };
    expect(missingPaymentVerificationFields(incomplete)).toEqual([
      "completed nomination",
      "payment reference",
      "payment proof",
      "paid amount",
      "currency",
      "paid date",
    ]);
    expect(paymentVerificationError(incomplete)).toContain("payment proof");
    expect(
      paymentVerificationError({
        applicationReference: "GBE-2026-118738",
        applicationSubmittedAt: new Date("2026-07-26T00:00:00.000Z"),
        paymentReference: "PAY-2026-000003",
        proofApplicationFileId: "proof-1",
        payerName: "Del Shad Hanefa",
        bankReference: "BANK-REF",
        amountMinor: 6_500_000,
        currency: "LKR",
        paidAt: new Date("2026-07-26T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
  it("permits permanent removal only for an empty provisional payment shell", () => {
    expect(
      canPurgeIncompletePaymentShell({
        workflowStatus: "uploading",
        applicationReference: null,
        applicationSubmittedAt: null,
        paymentReference: null,
        proofApplicationFileId: null,
        payerName: null,
        bankReference: null,
        amountMinor: null,
        currency: "LKR",
        paidAt: null,
      }),
    ).toBe(true);
    expect(
      canPurgeIncompletePaymentShell({
        workflowStatus: "uploading",
        applicationReference: null,
        applicationSubmittedAt: null,
        paymentReference: null,
        proofApplicationFileId: "proof-1",
        payerName: null,
        bankReference: null,
        amountMinor: null,
        currency: "LKR",
        paidAt: null,
      }),
    ).toBe(false);
  });
});
