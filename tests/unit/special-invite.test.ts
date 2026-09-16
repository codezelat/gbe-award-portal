// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { unzipSync } from "fflate";
import {
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { inviteState } from "@/lib/domain/special-invite";
import {
  nominationPricing,
  withSpecialInvite,
  assertNominationPrice,
} from "@/lib/domain/nomination-pricing";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { BETTER_AUTH_SECRET: "test-invite-encryption-only" },
}));
const {
  generateInviteCode,
  encryptInviteCode,
  decryptInviteCode,
  inviteCodeHash,
} = await import("@/server/security/special-invite-code");
const { specialInviteJpeg, specialInviteZip } =
  await import("@/server/services/special-invite-images");

describe("special invite protection", () => {
  it("generates six-character codes and authenticated encryption with random IVs", () => {
    const codes = Array.from({ length: 1000 }, generateInviteCode);
    expect(codes.every((code) => /^[A-Z0-9]{6}$/.test(code))).toBe(true);
    const code = codes[0];
    const first = encryptInviteCode(code),
      second = encryptInviteCode(code);
    expect(first).not.toBe(second);
    expect(first).not.toContain(code);
    expect(decryptInviteCode(first)).toBe(code);
    expect(inviteCodeHash(code)).toHaveLength(64);
    expect(() =>
      decryptInviteCode(first.replace(/\.[^.]+$/, ".AAAAAAAA")),
    ).toThrow();
  });
  it("uses exact expiry and terminal cancelled/used states", () => {
    const row = {
      draftId: "draft",
      revokedAt: null,
      consumedAt: null,
      expiresAt: new Date(2000),
    };
    expect(inviteState(row, 1999)).toBe("active");
    expect(inviteState(row, 2000)).toBe("expired");
    expect(inviteState({ ...row, consumedAt: new Date(1000) }, 9000)).toBe(
      "used",
    );
    expect(inviteState({ ...row, revokedAt: new Date(1000) }, 1999)).toBe(
      "cancelled",
    );
  });
  it("enforces an acknowledged discounted fee even in cycles without an offer", () => {
    const normal = nominationPricing(
      { year: 2027, currency: "LKR", nominationFeeMinor: 8500000 },
      1000,
    );
    const invite = {
      id: "invite",
      currency: "LKR",
      expiresAt: 2000,
      amountMinor: 6000000,
      originalAmountMinor: 6500000,
      status: "active" as const,
    };
    const active = withSpecialInvite(normal, invite);
    expect(active.amountMinor).toBe(6000000);
    expect(active.standardAmountMinor).toBe(6500000);
    expect(() => assertNominationPrice(active, 1)).toThrow();
    expect(
      withSpecialInvite({ ...normal, serverNow: 2000 }, invite),
    ).toMatchObject({
      amountMinor: 8500000,
      specialInvite: { status: "expired" },
    });
  });
  it("creates actual readable Code 128 JPGs and a ZIP with each code below its barcode", async () => {
    const images = await Promise.all(
      ["A8X42Z", "000001", "WWWWWW"].map(async (code) => {
        const bytes = await specialInviteJpeg(code);
        const metadata = await sharp(bytes).metadata();
        expect(metadata).toMatchObject({
          format: "jpeg",
          width: 640,
          height: 360,
        });
        // Decoding the final JPEG catches sizing, compression and barcode regressions.
        const { data, info } = await sharp(bytes)
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const source = new RGBLuminanceSource(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
        );
        expect(
          new MultiFormatReader()
            .decodeWithState(new BinaryBitmap(new HybridBinarizer(source)))
            .getText(),
        ).toBe(code);
        expect(bytes.length).toBeLessThan(39000);
        return { code, bytes };
      }),
    );
    const extracted = unzipSync(specialInviteZip(images));
    expect(Object.keys(extracted)).toEqual(
      images.map(({ code }) => `GBE-${code}.jpg`),
    );
    for (const image of images)
      expect(Buffer.from(extracted[`GBE-${image.code}.jpg`])).toEqual(
        image.bytes,
      );
  });
});
