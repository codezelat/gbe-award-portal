import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/domain/application-status";
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
});
