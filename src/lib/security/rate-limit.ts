import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
};

/** Zentrale Limits – an einer Stelle anpassbar und testbar. */
export const RATE_LIMITS = {
  /** Fehlversuche pro E-Mail + IP */
  loginPerAccount: { limit: 10, windowMs: 15 * 60_000 },
  /** Alle Login-Versuche pro IP (schützt vor Credential Stuffing über viele Konten) */
  loginPerIp: { limit: 50, windowMs: 15 * 60_000 },
  /** 2FA-Code-Eingaben pro IP (zusätzlich sperrt Better Auth das Konto nach 8 Fehlern) */
  twoFactorPerIp: { limit: 10, windowMs: 5 * 60_000 },
  /** Sensible Einstellungen (2FA aktivieren, Backup-Codes neu erzeugen) */
  sensitivePerUser: { limit: 10, windowMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-Window-Zähler in Postgres (ohne Redis). Atomar per Upsert, daher auch bei
 * parallelen Requests korrekt. Schlüssel sollten gehashte Identifikatoren enthalten.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);

  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, ${windowStart.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count
  `);
  const count = Number(rows[0]?.count ?? 1);

  // Gelegentlich alte Fenster aufräumen (billig, kein Cron nötig).
  if (Math.random() < 0.02) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }

  return {
    allowed: count <= rule.limit,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + rule.windowMs - now.getTime()) / 1000)),
  };
}

/** Setzt einen Zähler zurück (z. B. nach erfolgreichem Login). */
export async function resetRateLimit(db: Db, key: string, rule: RateLimitRule, now: Date = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  await db.execute(sql`delete from rate_limits where key = ${key} and window_start = ${windowStart.toISOString()}`);
}
