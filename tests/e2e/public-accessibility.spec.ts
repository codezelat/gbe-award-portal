import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public nomination route exposes an accessible guided form", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/apply");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const label of ["Company Name / Full Name"])
    await expect(page.getByLabel(label, { exact: false })).toBeVisible();
  await page
    .getByLabel("Company Name / Full Name", { exact: false })
    .fill("Accessible nomination");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByLabel("Email Address", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#phone")).toBeVisible();
  await expect(
    page.getByLabel("Award category", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Email Address", { exact: false })
    .fill("a11y@example.test");
  await page.locator("#phone").fill("0771234567");
  await page.getByRole("combobox", { name: /award category/i }).click();
  await page.getByRole("option").first().click();
  await page
    .getByLabel("Award nomination", { exact: false })
    .fill("Recognising this nominee for sustained excellence and impact.");
  await expect(page.getByLabel("Choose supporting documents")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Choose payment proof")).toBeVisible();
  await page.getByLabel("Choose payment proof").setInputFiles({
    name: "payment-proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfOQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText(
      "I confirm that the details provided are accurate and agree to the terms of the nomination process",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit nomination" }),
  ).toBeVisible();
  await expect(page.locator('a[href="/signup"]')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).exclude("iframe").analyze();
  expect(results.violations).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("public and authentication routes have no horizontal overflow", async ({
  page,
}) => {
  for (const path of ["/apply", "/login", "/privacy", "/terms", "/help"]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
      path,
    ).toBe(true);
  }
});

test("public routes and footer links remain available", async ({ page }) => {
  for (const path of ["/apply", "/apply/submitted", "/help", "/privacy", "/terms"]) {
    const response = await page.goto(path);
    expect(response, `${path} should return a response`).not.toBeNull();
    expect(response!.status(), `${path} should not be broken`).toBeLessThan(400);
  }

  await page.goto("/help");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "Privacy policy" }),
  ).toHaveAttribute("href", "https://gbeaward.com/privacy-policy");
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "/terms",
  );
  await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute(
    "href",
    "mailto:info@gbeaward.com",
  );

  const footerBox = await footer.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(Math.round(footerBox!.y + footerBox!.height)).toBe(
    await page.evaluate(() => window.innerHeight),
  );
});

test("protected portals redirect anonymous visitors to sign in", async ({
  page,
}) => {
  for (const path of ["/portal", "/admin", "/admin/applications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
