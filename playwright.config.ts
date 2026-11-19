import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-End-Tests laufen gegen den PRODUKTIONS-Build (`next build && next start`),
 * damit Security-Header, CSP und Routing so geprüft werden, wie sie ausgeliefert werden.
 *
 * Lokal mit vorhandenem Chrome: PW_CHANNEL=chrome pnpm test:e2e
 * In CI: `pnpm exec playwright install --with-deps chromium` vorher ausführen.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
