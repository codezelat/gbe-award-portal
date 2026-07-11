import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public nomination route exposes the exact accessible single-page form", async ({
  page,
}) => {
  await page.goto("/apply");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const label of [
    "Full Name / Company Name",
    "Industry / Business Sector",
    "Email Address",
    "Phone Number",
    "Award Nomination / Category",
  ])
    await expect(page.getByLabel(label, { exact: false })).toBeVisible();
  await expect(
    page.getByText(
      "I confirm that the details provided are accurate and agree to the terms of the nomination process",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator('a[href="/signup"]')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).exclude("iframe").analyze();
  expect(results.violations).toEqual([]);
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

test("protected portals redirect anonymous visitors to sign in", async ({
  page,
}) => {
  for (const path of ["/portal", "/admin", "/admin/applications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
