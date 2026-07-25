import { describe, expect, it } from "vitest";
import { safeExternalHref } from "@/lib/external-url";

describe("safe external links", () => {
  it("allows only HTTP and HTTPS website links", () => {
    expect(safeExternalHref("https://gbeaward.com/path")).toBe(
      "https://gbeaward.com/path",
    );
    expect(safeExternalHref("http://example.com")).toBe("http://example.com/");
    expect(safeExternalHref("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalHref("not-a-url")).toBeUndefined();
  });
});
