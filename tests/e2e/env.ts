/** Feste Testkonfiguration für End-to-End-Tests (nur synthetische Daten). */

const adminUrl = new URL(process.env.TEST_DATABASE_URL ?? "postgres://portfolio:portfolio@localhost:5432/postgres");
adminUrl.pathname = "/portfolio_e2e";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

export const E2E_ENV = {
  DATABASE_URL: adminUrl.toString(),
  APP_URL: `http://localhost:${E2E_PORT}`,
  BETTER_AUTH_SECRET: "e2e-test-secret-not-for-production-use-0123456789",
};

export const E2E_PASSWORD = "E2E-Test-Passwort-2026!";

/** Ein Owner und eine Client-IP pro Playwright-Projekt → keine gegenseitigen Rate-Limits. */
export const E2E_OWNERS = {
  desktop: { email: "e2e-desktop@example.test", name: "Desktop Tester", ip: "198.51.100.10" },
  mobile: { email: "e2e-mobile@example.test", name: "Mobile Tester", ip: "198.51.100.20" },
} as const;

export type E2EProject = keyof typeof E2E_OWNERS;

/** Owner mit bereits eingerichteter 2FA – für Fach-Tests, die nicht den Enrollment-Flow testen. */
export const E2E_READY_OWNERS = {
  desktop: { email: "e2e-ready-desktop@example.test", name: "Ready Desktop", ip: "198.51.100.30" },
  mobile: { email: "e2e-ready-mobile@example.test", name: "Ready Mobile", ip: "198.51.100.40" },
} as const;

/** Hier legt das Global-Setup die TOTP-Secrets der fertig eingerichteten Owner ab (gitignored). */
export const E2E_STATE_FILE = "tests/e2e/.state/secrets.json";
