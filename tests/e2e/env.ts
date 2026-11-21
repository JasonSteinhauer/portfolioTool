/** Feste Testkonfiguration für End-to-End-Tests (nur synthetische Daten). */

const adminUrl = new URL(process.env.TEST_DATABASE_URL ?? "postgres://portfolio:portfolio@localhost:5432/postgres");
adminUrl.pathname = "/portfolio_e2e";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

export const E2E_ENV = {
  DATABASE_URL: adminUrl.toString(),
  APP_URL: `http://localhost:${E2E_PORT}`,
  BETTER_AUTH_SECRET: "e2e-test-secret-not-for-production-use-0123456789",
  MEDIA_STORAGE_DIR: "tests/e2e/.state/media",
  // Deterministischer Test-Provider: kein Netzwerk, keine Kosten.
  AI_PROVIDER: "fake",
  AI_ALLOW_FAKE: "1",
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

/** Owner ohne 2FA (2FA ist optional) für den Portfolio-Workflow; eigene IPs → eigene Rate-Limits. */
export const E2E_PORTFOLIO_OWNERS = {
  desktop: { email: "e2e-portfolio-desktop@example.test", name: "Portfolio Desktop", ip: "198.51.100.50" },
  mobile: { email: "e2e-portfolio-mobile@example.test", name: "Portfolio Mobile", ip: "198.51.100.60" },
} as const;

/** Owner ohne 2FA für den Medien-Workflow (eigene Daten, damit sich die Specs nicht beeinflussen). */
export const E2E_MEDIA_OWNERS = {
  desktop: {
    email: "e2e-media-desktop@example.test",
    name: "Media Desktop",
    ip: "198.51.100.90",
    viewerIp: "198.51.100.110",
  },
  mobile: {
    email: "e2e-media-mobile@example.test",
    name: "Media Mobile",
    ip: "198.51.100.100",
    viewerIp: "198.51.100.120",
  },
} as const;

/** Owner ohne 2FA für den KI-Workflow. */
export const E2E_AI_OWNERS = {
  desktop: { email: "e2e-ai-desktop@example.test", name: "KI Desktop", ip: "198.51.100.130" },
  mobile: { email: "e2e-ai-mobile@example.test", name: "KI Mobile", ip: "198.51.100.140" },
} as const;

/** IPs der „Betrachter“ eines Freigabelinks (fremder Browser ohne Konto). */
export const E2E_VIEWER_IPS = { desktop: "198.51.100.70", mobile: "198.51.100.80" } as const;

/** Hier legt das Global-Setup die TOTP-Secrets der fertig eingerichteten Owner ab (gitignored). */
export const E2E_STATE_FILE = "tests/e2e/.state/secrets.json";
