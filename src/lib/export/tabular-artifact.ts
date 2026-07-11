import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { neutraliseSpreadsheetCell } from "@/server/services/export-service";

export async function buildTabularArtifact(input: {
  format: "xlsx" | "csv";
  sheetName: string;
  headings: string[];
  rows: unknown[][];
}) {
  const values = input.rows.map((row) => row.map(neutraliseSpreadsheetCell));
  if (input.format === "csv")
    return {
      body: new TextEncoder().encode(
        stringify([input.headings, ...values], { bom: true }),
      ),
      mime: "text/csv; charset=utf-8",
      rowCount: values.length,
    };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GBE Awards Portal";
  workbook.created = new Date();
  workbook.properties.date1904 = false;
  const sheet = workbook.addWorksheet(
    input.sheetName.replaceAll("_", " ").slice(0, 31),
    { views: [{ state: "frozen", ySplit: 1 }] },
  );
  sheet.addRow(input.headings);
  sheet.addRows(values);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6D552B" },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };
  const lastColumn = sheet.getColumn(input.headings.length).letter;
  sheet.autoFilter = {
    from: "A1",
    to: `${lastColumn}${Math.max(1, values.length + 1)}`,
  };
  sheet.columns = input.headings.map((heading, index) => ({
    header: heading,
    key: String(index),
    width: Math.min(
      52,
      Math.max(
        14,
        heading.length + 2,
        ...values.map((row) => String(row[index] ?? "").length + 2),
      ),
    ),
    style: { alignment: { vertical: "top", wrapText: true } },
  }));
  return {
    body: new Uint8Array(await workbook.xlsx.writeBuffer()),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rowCount: values.length,
  };
}
