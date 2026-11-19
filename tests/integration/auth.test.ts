import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { consumeRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/modules/audit/service";
import { createAuth } from "@/modules/auth/auth";
import { createOwner, OwnerAlreadyExistsError } from "@/modules/auth/owner";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const auth = createAuth(db, {
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-0123456789-abcdefghijklmnop", // gitleaks:allow – nur für Tests
  NODE_ENV: "test",
});

const PASSWORD = "Sicheres-Test-Passwort-42";

afterAll(async () => {
  await client.end();
});

describe("Owner anlegen", () => {
  it("legt Nutzer und Passwort-Konto an – Passwort nur als Hash", async () => {
    const owner = await createOwner(auth, db, {
      email: " Auth-Owner@Example.TEST ",
      name: "Test Owner",
      password: PASSWORD,
    });
    expect(owner.email).toBe("auth-owner@example.test");

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner.id));
    expect(user.role).toBe("owner");
    expect(user.twoFactorEnabled).toBe(false);

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, owner.id));
    expect(account.providerId).toBe("credential");
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);

    const [audit] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, owner.id));
    expect(audit.action).toBe("auth.owner.created");
  });

  it("verhindert doppelte Konten und schwache Passwörter", async () => {
    await expect(
      createOwner(auth, db, { email: "auth-owner@example.test", name: "X", password: PASSWORD }),
    ).rejects.toThrow(OwnerAlreadyExistsError);
    await expect(createOwner(auth, db, { email: "b@example.test", name: "B", password: "zu-kurz" })).rejects.toThrow();
    await expect(
      createOwner(auth, db, { email: "c@example.test", name: "C", password: "aaaaaaaaaaaaaaaa" }),
    ).rejects.toThrow();
  });
});

describe("Better Auth (serverseitig)", () => {
  it("meldet mit korrektem Passwort an und verlangt danach die 2FA-Einrichtung", async () => {
    const result = await auth.api.signInEmail({ body: { email: "auth-owner@example.test", password: PASSWORD } });
    expect("token" in result && result.token).toBeTruthy();
    expect("twoFactorRedirect" in result).toBe(false);
  });

  it("lehnt falsche Passwörter ab", async () => {
    await expect(
      auth.api.signInEmail({ body: { email: "auth-owner@example.test", password: "Falsches-Passwort-99" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email: "niemand@example.test", password: PASSWORD } }),
    ).rejects.toThrow();
  });

  it("erlaubt keine Selbstregistrierung", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "angreifer@example.test", password: PASSWORD, name: "Angreifer" } }),
    ).rejects.toThrow();
    const rows = await db.select().from(schema.users).where(eq(schema.users.email, "angreifer@example.test"));
    expect(rows).toHaveLength(0);
  });
});

describe("Rate-Limiting", () => {
  const rule = { limit: 3, windowMs: 60_000 };
  const now = new Date("2026-11-19T12:00:10Z");

  it("zählt pro Schlüssel und Fenster und blockiert ab dem Limit", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(db, "test:a", rule, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBe(50);
    expect((await consumeRateLimit(db, "test:b", rule, now)).allowed).toBe(true);
  });

  it("beginnt im nächsten Fenster neu und lässt sich zurücksetzen", async () => {
    expect((await consumeRateLimit(db, "test:a", rule, new Date("2026-11-19T12:01:05Z"))).count).toBe(1);
    await resetRateLimit(db, "test:a", rule, now);
    expect((await consumeRateLimit(db, "test:a", rule, now)).count).toBe(1);
  });

  it("ist unter Parallelität korrekt (atomarer Upsert)", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, "test:parallel", rule, now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(Math.max(...results.map((r) => r.count))).toBe(20);
  });
});

describe("Audit", () => {
  it("lehnt sensible Metadaten-Felder ab", async () => {
    await expect(
      recordAudit(db, { actorType: "system", action: "auth.logout", metadata: { password: "x" } }),
    ).rejects.toThrow(/password/);
    await expect(
      recordAudit(db, { actorType: "system", action: "auth.logout", metadata: { sessionToken: "x" } }),
    ).rejects.toThrow();
  });
});
