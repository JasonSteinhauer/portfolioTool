import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_OWNERS, E2E_PORT } from "./tests/e2e/env";

/**
 * End-to-End-Tests laufen gegen den PRODUKTIONS-Build (`next build && next start`)
 * mit eigener, bei jedem Lauf neu aufgebauter Datenbank (`portfolio_e2e`).
 *
 * Lokal mit vorhandenem Chrome: PW_CHANNEL=chrome pnpm test:e2e
 * In CI: `pnpm exec playwright install --with-deps chromium` vorher ausführen.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_ENV.APP_URL,
    trace: "retain-on-failure",
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], extraHTTPHeaders: { "x-forwarded-for": E2E_OWNERS.desktop.ip } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], extraHTTPHeaders: { "x-forwarded-for": E2E_OWNERS.mobile.ip } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: `${E2E_ENV.APP_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { ...E2E_ENV, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
