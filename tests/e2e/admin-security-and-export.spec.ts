import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_APPLICATION_REFERENCE,
  e2eDatabaseUrl,
} from "./database";

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = value
    .replace(/=+$/g, "")
    .toUpperCase()
    .split("")
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, "0"),
    )
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
  test.setTimeout(300_000);
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
  await expect(page).toHaveURL(/\/auth\/two-factor\/setup/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", { name: "Secure staff access" }),
  ).toBeVisible();

  await page.getByLabel("Confirm current password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Begin MFA enrolment" }).click();
  const uri = await page.getByLabel("Manual setup URI").inputValue();
  const qrCode = page.getByAltText("Authenticator setup QR code");
  await expect(qrCode).toBeVisible();
  await expect(qrCode).toHaveAttribute("src", /^data:image\/png;base64,/);
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
  await expect(
    page.getByRole("link", { name: E2E_APPLICATION_REFERENCE }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current view" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await download.failure()).toBeNull();

  for (const viewport of [
    { width: 1023, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(
      `/admin/applications?search=${encodeURIComponent(E2E_APPLICATION_REFERENCE)}`,
    );
    await expect(
      page.getByRole("link", { name: E2E_APPLICATION_REFERENCE }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
      `admin applications should not overflow at ${viewport.width}px`,
    ).toBe(true);
    await page.locator('summary[aria-label="Open navigation"]').click();
    await expect(
      page.getByRole("navigation", { name: "Mobile administration" }),
    ).toBeVisible();
  }

  const applicationHref = await page
    .getByRole("link", { name: E2E_APPLICATION_REFERENCE })
    .getAttribute("href");
  expect(applicationHref).toMatch(/^\/admin\/applications\//);

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [
      "/admin",
      "/admin/applications",
      applicationHref!,
      "/admin/applicants",
      "/admin/payments",
      "/admin/files",
      "/admin/communications",
      "/admin/exports",
      "/admin/reports",
      "/admin/categories",
      "/admin/cycles",
      "/admin/staff",
      "/admin/settings",
      "/admin/activity",
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.locator("#main-content"),
        `${path} should render the administration shell at ${viewport.width}px`,
      ).toBeVisible();
      await expect(
        page.locator("#main-content h1"),
        `${path} should render its page heading at ${viewport.width}px`,
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
        `${path} should not overflow at ${viewport.width}px`,
      ).toBe(true);
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(applicationHref!);

  const note = "Playwright verified the audited internal-note workflow.";
  const notes = page.locator("details").filter({
    has: page.getByText("Internal notes", { exact: true }),
  });
  await notes.locator("summary").click();
  await notes
    .getByPlaceholder("Add an internal note. Applicants cannot see this.")
    .fill(note);
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByText(note, { exact: true })).toBeVisible();

  await page.getByLabel("Next workflow status").selectOption("under_review");
  await page
    .getByLabel("Internal status change reason")
    .fill("Playwright verified the review transition.");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(
    page.getByText("Under review", { exact: true }).first(),
  ).toBeVisible();

  await page.getByLabel("Next workflow status").selectOption("approved");
  await page
    .getByLabel("Internal status change reason")
    .fill("Playwright verified the approval transition.");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(
    page.getByText("Nomination approved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("invited", { exact: true }).first(),
  ).toBeVisible();

  const paymentReview = page.locator("details").filter({
    has: page.getByText("Payment review", { exact: true }),
  });
  await paymentReview
    .getByLabel("Payment decision")
    .selectOption("under_review");
  await paymentReview.getByPlaceholder("Payer name").fill("Fixture payer");
  await paymentReview
    .getByPlaceholder("Bank reference")
    .fill("E2E-RECONCILED-REFERENCE");
  await paymentReview
    .getByRole("button", { name: "Save payment decision" })
    .click();
  await expect(paymentReview.locator("summary")).toContainText("Under review");
  await paymentReview.locator("summary").click();
  await expect(paymentReview.getByText("Current: under review")).toBeVisible();

  await paymentReview.getByLabel("Payment decision").selectOption("verified");
  await paymentReview
    .getByRole("button", { name: "Save payment decision" })
    .click();
  await expect(paymentReview.locator("summary")).toContainText("Verified");
  await paymentReview.locator("summary").click();
  await expect(
    paymentReview.locator('[data-slot="badge"]', { hasText: "Verified" }),
  ).toBeVisible();

  await page.goto(
    `/admin/applicants?search=${encodeURIComponent("fixture@example.test")}`,
  );
  await expect(
    page.getByText("fixture@example.test", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resend invitation" }).click();
  await expect(
    page.getByRole("button", { name: "Resend invitation" }),
  ).toBeVisible();

  await page.goto("/admin/communications");
  await page
    .getByPlaceholder("GBE-2026-000001")
    .fill(E2E_APPLICATION_REFERENCE);
  await page
    .getByPlaceholder("Message subject")
    .fill("E2E communication check");
  await page
    .getByPlaceholder("Applicant-visible message")
    .fill("Playwright verified the manual communications workflow.");
  const messageQueued = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/admin/communications",
  );
  await page.getByRole("button", { name: "Queue message" }).click();
  expect((await messageQueued).ok()).toBe(true);
  await page.goto(applicationHref!);
  const communicationHistory = page.locator("details").filter({
    has: page.getByText("Communication history", { exact: false }),
  });
  await communicationHistory.locator("summary").click();
  await expect(
    communicationHistory.getByText(/E2E communication check/),
  ).toBeVisible();

  await page.goto(
    `/admin/payments?search=${encodeURIComponent(E2E_APPLICATION_REFERENCE)}`,
  );
  await expect(
    page.getByRole("link", { name: E2E_APPLICATION_REFERENCE }),
  ).toBeVisible();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();

  await page.goto(
    `/admin/files?search=${encodeURIComponent(E2E_APPLICATION_REFERENCE)}`,
  );
  await expect(
    page.getByText("fixture-payment-proof.pdf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await page
    .getByPlaceholder("Mandatory operational reason")
    .fill("Playwright verified the file disposition workflow.");
  const fileRejected = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/admin/files",
  );
  await page.getByRole("button", { name: "Confirm reject" }).click();
  expect((await fileRejected).ok()).toBe(true);
  const fileRow = page.locator("tr", {
    has: page.getByText("fixture-payment-proof.pdf", { exact: true }),
  });
  await expect(fileRow).toContainText("rejected");

  await page.goto("/admin/categories");
  const categoryName = "Playwright operational category";
  await page.getByPlaceholder("Category name").fill(categoryName);
  await page.getByPlaceholder("Stable code").fill("E2E-OPS");
  await page
    .getByPlaceholder("category-slug")
    .fill("playwright-operational-category");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

  await page.goto("/admin/cycles");
  const futureCycleForm = page.locator("details").filter({
    has: page.getByText("Create future award cycle", { exact: true }),
  });
  await futureCycleForm.locator("summary").click();
  const futureCycleName = "Playwright future cycle";
  await futureCycleForm.getByPlaceholder("Cycle name").fill(futureCycleName);
  await futureCycleForm
    .getByPlaceholder("cycle-slug")
    .fill("playwright-future-cycle");
  await futureCycleForm.getByPlaceholder("Year").fill("2099");
  await futureCycleForm
    .getByPlaceholder("Public heading")
    .fill("Playwright future awards");
  await futureCycleForm
    .locator('input[name="opensAt"]')
    .fill("2099-01-01T00:00");
  await futureCycleForm
    .locator('input[name="closesAt"]')
    .fill("2099-12-31T23:59");
  await futureCycleForm
    .getByPlaceholder("Public introduction")
    .fill("Playwright verifies guarded future-cycle creation.");
  await futureCycleForm
    .getByPlaceholder("Approved declaration text")
    .fill("Playwright verifies that an approved declaration is required.");
  await futureCycleForm.getByPlaceholder("Declaration version").fill("e2e-1");
  await futureCycleForm.getByPlaceholder("Terms version").fill("e2e-1");
  await futureCycleForm.getByPlaceholder("Privacy version").fill("e2e-1");
  await futureCycleForm
    .getByRole("button", { name: "Create draft cycle" })
    .click();
  await expect(page.locator("#admin-cycle")).toContainText(futureCycleName);

  await page.goto("/admin/settings");
  await page.locator("#support_contact").fill("e2e-support@example.test");
  await page
    .locator("form", { has: page.locator("#support_contact") })
    .getByRole("button", { name: "Save setting" })
    .click();
  await expect(page.locator("#support_contact")).toHaveValue(
    "e2e-support@example.test",
  );

  await page.goto("/admin/staff");
  const staffEmail = "e2e-operations@example.test";
  await page.getByPlaceholder("Full name").fill("E2E Operations Staff");
  await page.getByPlaceholder("Work email").fill(staffEmail);
  await page.getByRole("button", { name: "Send secure invitation" }).click();
  await expect(page.getByText(staffEmail, { exact: false })).toBeVisible();

  const db = postgres(e2eDatabaseUrl(), { max: 1 });
  const [outbox] = await db<{ payload: { url?: string } }[]>`
    select payload
    from email_outbox
    where recipient_email = ${staffEmail}
      and template_key = 'staff_invitation'
    order by created_at desc
    limit 1
  `;
  const invitationUrl = outbox?.payload.url;
  expect(invitationUrl).toBeTruthy();
  await db`
    update invitations
    set status = 'sent', sent_at = now(), updated_at = now()
    where email_normalised = ${staffEmail}
      and type = 'staff'
  `;
  await db.end();

  await page.goto(invitationUrl!);
  await page
    .getByLabel("Password", { exact: true })
    .fill("E2E-Staff-Password-2026!");
  await page.getByLabel("Confirm password").fill("E2E-Staff-Password-2026!");
  await page.getByRole("button", { name: "Activate secure access" }).click();
  await expect(page).toHaveURL(/\/login\?activated=true/);
});
