import { describe, expect, it } from "vitest";
import { paginationSummary, parsePage } from "@/lib/domain/pagination";

describe("table pagination", () => {
  it("reports the visible range and the total number of pages", () => {
    expect(paginationSummary(1, 25, 54, 25)).toEqual({
      pages: 3,
      start: 1,
      end: 25,
    });
    expect(paginationSummary(2, 25, 54, 25)).toEqual({
      pages: 3,
      start: 26,
      end: 50,
    });
    expect(paginationSummary(3, 25, 54, 4)).toEqual({
      pages: 3,
      start: 51,
      end: 54,
    });
    expect(paginationSummary(1, 25, 0, 0)).toEqual({
      pages: 1,
      start: 0,
      end: 0,
    });
    expect(paginationSummary(2, 25, 50, 25).pages).toBe(2);
  });
  it("bounds invalid and oversized page parameters", () => {
    for (const value of [
      undefined,
      "",
      "-1",
      "0",
      "1.5",
      "NaN",
      "Infinity",
      "2oops",
    ])
      expect(parsePage(value)).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("999999999")).toBe(100000);
  });
});
