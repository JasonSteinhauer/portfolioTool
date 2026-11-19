import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Env } from "@/lib/config/env";
import * as schema from "@/lib/db/schema";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 3; // 3 Tage
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60; // Verlängerung höchstens stündlich

/**
 * Konfiguration von Better Auth. Bewusst als Fabrik ohne `server-only`, damit Skripte
 * (Owner anlegen) und Integrationstests dieselbe Konfiguration nutzen.
 *
 * Sicherheitsentscheidungen (siehe docs/adr/0004-authentifizierung.md):
 * - Registrierung ist deaktiviert; der Owner wird per Skript angelegt.
 * - Die HTTP-Endpunkte von Better Auth werden NICHT gemountet. Login & 2FA laufen nur über
 *   Server Actions, die `auth.api.*` serverseitig aufrufen (eigenes Rate-Limiting + Audit).
 * - Kein Session-Cookie-Cache: Widerrufene Sessions sind sofort ungültig.
 */
export function createAuth(
  db: PostgresJsDatabase<typeof schema>,
  env: Pick<Env, "APP_URL" | "BETTER_AUTH_SECRET" | "NODE_ENV">,
) {
  return betterAuth({
    appName: "Development Portfolio",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    // Better Auth limitiert nur seine HTTP-Routen – die nutzen wir nicht. Eigene Limits: src/lib/security/rate-limit.ts
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "dp",
      useSecureCookies: env.NODE_ENV === "production",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    telemetry: { enabled: false },
    plugins: [
      twoFactor({
        issuer: "dev.portfolio",
        backupCodeOptions: { amount: 10, length: 10 },
        accountLockout: { enabled: true, maxFailedAttempts: 8, durationSeconds: 15 * 60 },
      }),
      // Setzt Cookies, wenn auth.api.* aus Server Actions aufgerufen wird. Muss das letzte Plugin sein.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
