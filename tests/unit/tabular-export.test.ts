import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildTabularArtifact } from "@/lib/export/tabular-artifact";

describe("tabular export artifacts", () => {
  it("creates a real styled XLSX workbook with frozen headings", async () => {
    const artifact = await buildTabularArtifact({
      format: "xlsx",
      sheetName: "application_register",
      headings: ["Reference", "Nominee"],
      rows: [["GBE-2026-000001", "Acme"]],
    });
    expect(Buffer.from(artifact.body).subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(artifact.body).buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("A1").value).toBe("Reference");
    expect(sheet.getCell("A2").value).toBe("GBE-2026-000001");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
  it("creates UTF-8 CSV and neutralises spreadsheet formulas", async () => {
    const artifact = await buildTabularArtifact({
      format: "csv",
      sheetName: "test",
      headings: ["Value"],
      rows: [['=HYPERLINK("bad")']],
    });
    const text = new TextDecoder().decode(artifact.body);
    expect(Array.from(artifact.body.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain("'=HYPERLINK");
  });
});
