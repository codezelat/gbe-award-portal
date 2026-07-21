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

test("programme details load Facebook media only after the visitor requests it", async ({
  page,
}) => {
  await page.goto("/apply");
  await expect(page.getByRole("button", { name: "View Program Details" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.getByRole("button", { name: "View Program Details" }).click();
  await expect(
    page.getByRole("heading", { name: "Programme details" }),
  ).toBeVisible();

  const embed = page.getByTestId("programme-facebook-embed");
  await expect(embed).toHaveAttribute("src", /facebook\.com\/plugins\/post\.php/);
  await page.getByRole("button", { name: "Next programme item" }).click();
  await expect(embed).toHaveAttribute("src", /facebook\.com\/plugins\/video\.php/);
  await expect(page.getByRole("link", { name: "Watch with sound" })).toHaveAttribute(
    "href",
    "https://www.facebook.com/reel/2587233971693850",
  );
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

test("public discovery files expose only indexable routes", async ({ page }) => {
  const robotsResponse = await page.goto("/robots.txt");
  expect(robotsResponse).not.toBeNull();
  expect(await page.locator("body").textContent()).toContain("Sitemap:");
  expect(await page.locator("body").textContent()).toContain("Disallow: /api/");

  const sitemapResponse = await page.goto("/sitemap.xml");
  expect(sitemapResponse).not.toBeNull();
  const sitemap = await page.locator("body").textContent();
  for (const path of ["/apply", "/help", "/privacy", "/terms"])
    expect(sitemap).toContain(path);
  for (const path of ["/login", "/auth/", "/portal", "/admin"])
    expect(sitemap).not.toContain(path);
});

test("public metadata is canonical and private routes are explicitly no-index", async ({
  page,
}) => {
  await page.goto("/apply");
  await expect(page).toHaveTitle("Apply for the GBE Awards 2026 | GBE Awards");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3100/apply",
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  for (const path of [
    "/login",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/apply/submitted",
    "/portal",
    "/admin",
    "/admin/login",
  ]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"], path).toBe(
      "noindex, nofollow, noarchive",
    );
  }

  for (const path of [
    "/login",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/apply/submitted",
  ]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
  }
});

test("help contact actions expose the intended destinations", async ({ page }) => {
  await page.goto("/help");
  await expect(
    page.getByRole("link", { name: "Contact info@gbeaward.com" }),
  ).toHaveAttribute("href", "mailto:info@gbeaward.com");
  await expect(
    page.getByRole("link", { name: "Contact us on WhatsApp" }),
  ).toHaveAttribute("href", "https://wa.link/10p065");
});

test("protected portals redirect anonymous visitors to sign in", async ({
  page,
}) => {
  for (const path of ["/portal", "/admin", "/admin/applications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("requires Turnstile after two failed sign-in attempts", async ({ page }) => {
  const email = `turnstile-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("incorrect-password");

  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByText("The email or password was not recognised."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByText("Complete the security verification, then try again."),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Security verification" }),
  ).toBeVisible();

  await page.waitForFunction(() =>
    Boolean(
      document.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      )?.value,
    ),
  );
  const challengeAttempt = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in securely" }).click();
  expect((await challengeAttempt).status()).toBe(401);
  await expect(
    page.getByText("Complete the security verification, then try again."),
  ).toBeVisible();

  const thirdAttempt = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: "incorrect-password", rememberMe: true },
  });
  expect(thirdAttempt.status()).toBe(403);
  await expect(thirdAttempt.json()).resolves.toMatchObject({
    code: "TURNSTILE_REQUIRED",
  });
});
