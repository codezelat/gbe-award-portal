import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE,
  normalisePhone,
  normaliseUrl,
  publicApplicationSchema,
} from "@/lib/validation/application";
import { declarationText } from "@/config/brand";
const valid = {
  nomineeName: "Acme Ltd",
  designation: "",
  awardNomination: "Recognising Acme Ltd for sustained technology innovation.",
  businessWebsite: "gbeaward.com",
  email: "hello@example.com",
  phone: "+94771234567",
  categoryId: "01911111-1111-7111-8111-111111111111",
  declarationAccepted: true,
  declarationText,
  turnstileToken: "token",
  honeypot: "",
  startedAt: Date.now(),
  idempotencyKey: "01911111-1111-7111-8111-111111111112",
};
describe("public application validation", () => {
  it("accepts the exact minimal valid payload", () =>
    expect(publicApplicationSchema.safeParse(valid).success).toBe(true));
  it("requires the declaration", () =>
    expect(
      publicApplicationSchema.safeParse({
        ...valid,
        declarationAccepted: false,
      }).success,
    ).toBe(false));
  it("normalises common URLs and international phones", () => {
    expect(normaliseUrl("gbeaward.com")).toBe("https://gbeaward.com");
    expect(normalisePhone("+94 77 123 4567")).toBe("+94771234567");
  });
  it("uses the binary 5 MiB limit", () =>
    expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024));
});
