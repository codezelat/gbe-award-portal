import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_APPLICATION_REFERENCE,
} from "./database";

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = value
    .replace(/=+$/g, "")
    .toUpperCase()
    .split("")
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0"))
    .join("");
  return Buffer.from(
    bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [],
  );
}

function totp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest.at(-1)! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

test("enforces staff MFA, then permits search and a real filtered export", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One administrator identity must enrol MFA exactly once.",
  );
  test.setTimeout(60_000);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  const signInResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in securely" }).click();
  const signIn = await signInResponse;
  expect(signIn.ok(), await signIn.text()).toBe(true);
  await expect(page).toHaveURL(/\/auth\/two-factor\/setup/);
  await expect(
    page.getByRole("heading", { name: "Secure staff access" }),
  ).toBeVisible();

  await page.getByLabel("Confirm current password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Begin MFA enrolment" }).click();
  const uri = await page.getByLabel("Authenticator setup URI").inputValue();
  const secret = new URL(uri).searchParams.get("secret");
  expect(secret).toBeTruthy();
  await page.getByLabel("Six-digit authenticator code").fill(totp(secret!));
  await page
    .getByRole("button", { name: "Verify and enter administration" })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();

  await page.goto(
    `/admin/applications?search=${encodeURIComponent(E2E_APPLICATION_REFERENCE)}`,
  );
  await expect(page.getByRole("link", { name: E2E_APPLICATION_REFERENCE })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export current view" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await download.failure()).toBeNull();
});
