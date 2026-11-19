import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";
import { seedReportTypes } from "../../src/lib/db/seed";
import { createAuth } from "../../src/modules/auth/auth";
import { createOwner } from "../../src/modules/auth/owner";
import { totp } from "../support/totp";
import { E2E_ENV, E2E_OWNERS, E2E_PASSWORD, E2E_READY_OWNERS, E2E_STATE_FILE } from "./env";

/** Richtet 2FA über die echte Better-Auth-API ein (Login → Aktivieren → Code bestätigen). */
async function enrollTwoFactor(auth: ReturnType<typeof createAuth>, email: string) {
  const { headers } = await auth.api.signInEmail({ body: { email, password: E2E_PASSWORD }, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const requestHeaders = new Headers({ cookie });
  const enabled = await auth.api.enableTwoFactor({
    body: { password: E2E_PASSWORD, method: "totp" },
    headers: requestHeaders,
  });
  if (enabled.method !== "totp") throw new Error("TOTP erwartet");
  const secret = new URL(enabled.totpURI).searchParams.get("secret")!;
  const usedWindow = Math.floor(Date.now() / 30_000);
  await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers: requestHeaders });
  return { secret, usedWindow };
}

/**
 * Baut vor jedem E2E-Lauf eine frische Datenbank auf: Migrationen, Seed und je ein
 * Test-Owner pro Browser-Projekt (damit Desktop und Mobil parallel laufen können).
 */
export default async function globalSetup() {
  const adminUrl = new URL(E2E_ENV.DATABASE_URL);
  const dbName = adminUrl.pathname.slice(1);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const sql = postgres(E2E_ENV.DATABASE_URL, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedReportTypes(db);
  const auth = createAuth(db, { ...E2E_ENV, NODE_ENV: "production" });
  for (const owner of Object.values(E2E_OWNERS)) {
    await createOwner(auth, db, { email: owner.email, name: owner.name, password: E2E_PASSWORD });
  }
  const state: Record<string, { secret: string; usedWindow: number }> = {};
  for (const [project, owner] of Object.entries(E2E_READY_OWNERS)) {
    await createOwner(auth, db, { email: owner.email, name: owner.name, password: E2E_PASSWORD });
    state[project] = await enrollTwoFactor(auth, owner.email);
  }
  mkdirSync(dirname(E2E_STATE_FILE), { recursive: true });
  writeFileSync(E2E_STATE_FILE, JSON.stringify(state));
  await sql.end();
}
