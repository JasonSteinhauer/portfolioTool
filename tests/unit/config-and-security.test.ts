import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/config/env";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { isActive } from "@/ui/nav-items";

const SECRET = "q8Zr3vLm1XpT6wYc0NfB4sHj7KdEaUiO2gR5tV9n"; // gitleaks:allow – Testwert

describe("parseEnv", () => {
  it("akzeptiert eine gültige Konfiguration und setzt Defaults", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db", BETTER_AUTH_SECRET: SECRET });
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("meldet fehlende und ungültige Werte verständlich", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "mysql://x@y/z", BETTER_AUTH_SECRET: SECRET })).toThrow(/postgres/);
    expect(() =>
      parseEnv({ DATABASE_URL: "postgres://u@h/db", NODE_ENV: "staging", BETTER_AUTH_SECRET: SECRET }),
    ).toThrow(/NODE_ENV/);
  });

  it("verlangt ein starkes Auth-Secret", () => {
    const base = { DATABASE_URL: "postgres://u@h/db" };
    expect(() => parseEnv(base)).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "kurz" })).toThrow(/mindestens 32/);
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "x".repeat(40) })).toThrow(/zu schwach/);
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "ab".repeat(20) })).toThrow(/zu schwach/);
  });
});

describe("buildContentSecurityPolicy", () => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  it("ist in Produktion strikt", () => {
    const csp = buildContentSecurityPolicy({ nonce, isDev: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("lockert nur in der Entwicklung", () => {
    const csp = buildContentSecurityPolicy({ nonce, isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("lehnt manipulierte Nonces ab (Header-Injection)", () => {
    expect(() => buildContentSecurityPolicy({ nonce: "abc'; script-src *", isDev: false })).toThrow();
  });
});

describe("Navigation isActive", () => {
  it("markiert Dashboard nur exakt, Bereiche auch für Unterseiten", () => {
    expect(isActive("/app", "/app")).toBe(true);
    expect(isActive("/app/reports", "/app")).toBe(false);
    expect(isActive("/app/reports/123/edit", "/app/reports")).toBe(true);
    expect(isActive("/app/reportsX", "/app/reports")).toBe(false);
  });
});
