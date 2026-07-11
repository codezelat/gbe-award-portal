export const E2E_DATABASE_NAME = "gbe_award_portal_test_e2e";
export const E2E_R2_PREFIX = "e2e/playwright";

export function databaseUrlFor(name: string) {
  const source = process.env.DATABASE_URL_DIRECT;
  if (!source)
    throw new Error("DATABASE_URL_DIRECT is required for Playwright tests.");
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
}

export function e2eDatabaseUrl() {
  return databaseUrlFor(E2E_DATABASE_NAME);
}
