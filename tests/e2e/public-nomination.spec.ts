import { expect, test, type Page } from "@playwright/test";

const paymentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfOQAAAAASUVORK5CYII=",
  "base64",
);

async function fillNomination(page: Page) {
  await page.goto("/apply");
  await page.getByLabel("Full Name / Company Name", { exact: false }).fill(
    `Playwright Nominee ${Date.now()}`,
  );
  await page
    .getByLabel("Industry / Business Sector", { exact: false })
    .fill("Technology");
  await page
    .getByLabel("Email Address", { exact: false })
    .fill(`playwright-${crypto.randomUUID()}@example.test`);
  await page.locator("#phone").fill("+94771234567");
  await page.getByRole("combobox", { name: /award nomination/i }).click();
  await page.getByRole("option").first().click();
}

test("submits a valid nomination through real isolated Neon and R2", async ({
  page,
}) => {
  await page.route(/\.r2\.cloudflarestorage\.com\//, async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await fetch(request.url(), {
      method: "PUT",
      headers: request.headers(),
      body: body ? new Uint8Array(body) : undefined,
    });
    await route.fulfill({ status: response.status });
  });
  await fillNomination(page);
  await page.getByLabel("Choose payment proof").setInputFiles({
    name: "payment-proof.png",
    mimeType: "image/png",
    buffer: paymentPng,
  });
  await page
    .getByRole("checkbox", {
      name: /I confirm that the details provided are accurate/i,
    })
    .check();
  await page.waitForFunction(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]',
    );
    return Boolean(input?.value);
  });
  await page.getByRole("button", { name: "Submit nomination" }).click();
  await expect(
    page.getByRole("heading", { name: "Nomination received" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^GBE-2026-\d{6}$/)).toBeVisible();
});

test("retries only a failed upload without duplicating the application", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(/\.r2\.cloudflarestorage\.com\//, async (route) => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 503 });
      return;
    }
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await fetch(request.url(), {
      method: "PUT",
      headers: request.headers(),
      body: body ? new Uint8Array(body) : undefined,
    });
    await route.fulfill({ status: response.status });
  });
  await fillNomination(page);
  await page.getByLabel("Choose payment proof").setInputFiles({
    name: "payment-proof.png",
    mimeType: "image/png",
    buffer: paymentPng,
  });
  await page
    .getByRole("checkbox", {
      name: /I confirm that the details provided are accurate/i,
    })
    .check();
  await page.waitForFunction(() =>
    Boolean(
      document.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      )?.value,
    ),
  );
  await page.getByRole("button", { name: "Submit nomination" }).click();
  await expect(page.getByText(/Successful files are preserved/i)).toBeVisible();
  await page.getByRole("button", { name: "Retry failed files" }).click();
  await expect(
    page.getByRole("heading", { name: "Nomination received" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(attempts).toBe(2);
});

test("focuses a complete validation summary before any network submission", async ({
  page,
}) => {
  let initiated = false;
  page.on("request", (request) => {
    if (request.url().includes("/api/public/applications/initiate"))
      initiated = true;
  });
  await page.goto("/apply");
  await page.getByRole("button", { name: "Submit nomination" }).click();
  const summary = page.locator("#form-error");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Enter the nominee or organisation name.");
  await expect(summary).toContainText("You must accept the nomination declaration.");
  await expect(summary).toContainText("Choose one payment slip or screenshot.");
  expect(initiated).toBe(false);
});

test("rejects invalid, oversized and excess supporting files in the browser", async ({
  page,
}) => {
  await page.goto("/apply");
  await page.waitForLoadState("networkidle");
  const input = page.getByLabel("Choose supporting documents");
  await input.setInputFiles({
    name: "malware.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not executable content"),
  });
  await expect(page.getByText(/File type must be one of/i)).toBeVisible();

  await input.setInputFiles({
    name: "oversized.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByText("Each file must be 5 MB or smaller.")).toBeVisible();

  await input.setInputFiles(
    Array.from({ length: 6 }, (_, index) => ({
      name: `support-${index + 1}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    })),
  );
  await expect(page.getByText("Too many files", { exact: true })).toBeVisible();
});
