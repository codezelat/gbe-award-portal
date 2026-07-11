import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "bun run dev --hostname 127.0.0.1 --port 3100",
    env: {
      ...process.env,
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      TURNSTILE_EXPECTED_HOSTNAME: "localhost,127.0.0.1",
    },
    url: "http://127.0.0.1:3100/apply",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
