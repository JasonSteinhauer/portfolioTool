import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { createAuth } from "@/modules/auth/auth";
import { configuredSetupToken, ownerExists, runInitialSetup } from "@/modules/auth/setup";

/** Ersteinrichtung im Browser – eigene, leere Datenbank (die gemeinsame Test-DB hat schon Nutzer). */
const adminUrl = new URL(inject("testDatabaseUrl"));
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const name = `portfolio_setup_${Date.now()}_${process.pid}`;
const url = new URL(inject("testDatabaseUrl"));
url.pathname = `/${name}`;
let client: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;
let auth: ReturnType<typeof createAuth>;

const TOKEN = "einrichtung-".padEnd(40, "x");
const input = {
  token: TOKEN,
  name: "Alex Beispiel",
  email: "Owner@Example.test ",
  password: "ein langer synthetischer satz 2026",
  passwordRepeat: "ein langer synthetischer satz 2026",
};

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  client = postgres(url.toString(), { max: 2, onnotice: () => {} });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  auth = createAuth(db, {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: ["test", "secret", "0123456789", "abcdefghijklmnop"].join("-"),
    APP_URL: "http://localhost:3000",
    DATABASE_URL: url.toString(),
  } as never);
});

afterAll(async () => {
  await client?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

describe("Ersteinrichtung", () => {
  it("ist ohne ausreichend langes SETUP_TOKEN deaktiviert", async () => {
    expect(configuredSetupToken({})).toBeNull();
    expect(configuredSetupToken({ SETUP_TOKEN: "zu-kurz" })).toBeNull();
    expect(configuredSetupToken({ SETUP_TOKEN: TOKEN })).toBe(TOKEN);
    expect(await runInitialSetup(auth, db, input, null)).toEqual({
      ok: false,
      error: "Die Einrichtung ist nicht aktiviert.",
    });
  });

  it("prüft Schlüssel und Passwortregeln", async () => {
    expect(await runInitialSetup(auth, db, { ...input, token: "falsch" }, TOKEN)).toMatchObject({
      ok: false,
      error: /falsch/,
    });
    expect(await runInitialSetup(auth, db, { ...input, passwordRepeat: "anders" }, TOKEN)).toMatchObject({
      ok: false,
      error: /stimmen nicht/,
    });
    expect(
      await runInitialSetup(auth, db, { ...input, password: "kurz", passwordRepeat: "kurz" }, TOKEN),
    ).toMatchObject({ ok: false });
    expect(await ownerExists(db)).toBe(false);
  });

  it("legt genau einmal einen Owner an – danach dauerhaft gesperrt", async () => {
    const results = await Promise.all([
      runInitialSetup(auth, db, input, TOKEN),
      runInitialSetup(auth, db, { ...input, email: "zweiter@example.test" }, TOKEN),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ownerExists(db)).toBe(true);
    expect(await runInitialSetup(auth, db, { ...input, email: "dritter@example.test" }, TOKEN)).toMatchObject({
      ok: false,
      error: /bereits abgeschlossen/,
    });
    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    // Passwort nur als Hash gespeichert, Login funktioniert
    const [account] = await db.select().from(schema.accounts);
    expect(account.password).not.toContain("synthetischer");
    const signIn = await auth.api.signInEmail({ body: { email: "owner@example.test", password: input.password } });
    expect(signIn.user.email).toBe("owner@example.test");
  });
});
