import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildApplicationSummaryPdf } from "@/lib/export/application-summary-pdf";

const require = createRequire(import.meta.url);

describe("application summary PDF", () => {
  it("creates a real PDF containing the applicant-visible record", async () => {
    const result = await buildApplicationSummaryPdf({
      regularFontPath:
        require.resolve("@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf"),
      boldFontPath:
        require.resolve("@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf"),
      data: {
        reference: "GBE-2026-000042",
        nomineeName: "Acme International",
        designation: "Managing Director",
        industrySector: "Technology",
        businessWebsite: "https://example.com",
        email: "nominee@example.com",
        phone: "+94 77 123 4567",
        category: "Excellence in Innovation",
        workflowStatus: "under review",
        paymentStatus: "verified",
        submittedAt: "11 July 2026, 10:30:00 +05:30",
        generatedAt: "11 July 2026, 11:00:00 +05:30",
      },
    });
    expect(result.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.byteLength).toBeGreaterThan(10_000);
  });
});
