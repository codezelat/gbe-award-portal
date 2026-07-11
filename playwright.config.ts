import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { E2E_R2_PREFIX, e2eDatabaseUrl } from "./tests/e2e/database";

const testDatabaseUrl = e2eDatabaseUrl();

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "bun tests/e2e/start-server.ts",
    env: {
      ...process.env,
      APP_ENV: "local",
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_DIRECT: testDatabaseUrl,
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      BETTER_AUTH_URL: "http://localhost:3100",
      R2_OBJECT_PREFIX: E2E_R2_PREFIX,
      RESEND_API_KEY: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      TURNSTILE_EXPECTED_HOSTNAME: "localhost,127.0.0.1",
    },
    url: "http://localhost:3100/apply",
    reuseExistingServer: false,
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
