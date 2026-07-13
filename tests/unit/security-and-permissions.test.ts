import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/domain/permissions";
import {
  isDetectedTypeAllowed,
  isExtensionAllowed,
  initiateApplicationSchema,
} from "@/lib/validation/application";
import { declarationText } from "@/config/brand";

const base = {
  nomineeName: "Acme",
  designation: "",
  awardNomination: "Recognising Acme for sustained technology innovation.",
  businessWebsite: "",
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

describe("permission enforcement", () => {
  it("grants role defaults and honours explicit denial", () => {
    expect(
      hasPermission({ role: "staff", permissions: {} }, "payments.verify"),
    ).toBe(true);
    expect(
      hasPermission({ role: "staff", permissions: {} }, "configuration.manage"),
    ).toBe(false);
    expect(
      hasPermission(
        { role: "staff", permissions: { "payments.verify": false } },
        "payments.verify",
      ),
    ).toBe(false);
    expect(
      hasPermission(
        { role: "reviewer", permissions: {} },
        "applications.view_all",
      ),
    ).toBe(true);
    expect(
      hasPermission({ role: "super_admin", permissions: {} }, "anything"),
    ).toBe(true);
  });
});

describe("upload security", () => {
  it("requires claimed and detected MIME types to agree", () => {
    expect(
      isDetectedTypeAllowed("payment_proof", "image/png", "image/png"),
    ).toBe(true);
    expect(
      isDetectedTypeAllowed("payment_proof", "image/png", "application/pdf"),
    ).toBe(false);
    expect(
      isDetectedTypeAllowed(
        "supporting_document",
        "application/msword",
        "application/x-cfb",
      ),
    ).toBe(true);
    expect(
      isDetectedTypeAllowed(
        "payment_proof",
        "application/msword",
        "application/x-cfb",
      ),
    ).toBe(false);
  });

  it("rejects misleading or missing filename extensions", () => {
    expect(isExtensionAllowed("proof.pdf", "application/pdf")).toBe(true);
    expect(isExtensionAllowed("proof.exe", "application/pdf")).toBe(false);
    expect(isExtensionAllowed("portrait.JPEG", "image/jpeg")).toBe(true);
  });

  it("requires exactly one payment proof and at most five supporting files", () => {
    const file = (
      index: number,
      kind: "supporting_document" | "payment_proof",
    ) => ({
      id: `01911111-1111-7111-8111-${String(index).padStart(12, "0")}`,
      name: `file-${index}.pdf`,
      size: 100,
      type: "application/pdf",
      kind,
    });
    expect(
      initiateApplicationSchema.safeParse({
        ...base,
        files: [file(1, "payment_proof")],
      }).success,
    ).toBe(true);
    expect(
      initiateApplicationSchema.safeParse({ ...base, files: [] }).success,
    ).toBe(false);
    expect(
      initiateApplicationSchema.safeParse({
        ...base,
        files: [
          ...Array.from({ length: 5 }, (_, i) =>
            file(i + 1, "supporting_document"),
          ),
          file(7, "payment_proof"),
        ],
      }).success,
    ).toBe(true);
  });
});
