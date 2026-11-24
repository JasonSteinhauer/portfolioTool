import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import type * as schema from "@/lib/db/schema";
import type { Auth } from "./auth";
import { createOwner, ownerInputSchema } from "./owner";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Ersteinrichtung im Browser – für Hosting ohne Shell-Zugriff auf die Datenbank.
 *
 * Die Seite existiert nur, solange (1) `SETUP_TOKEN` gesetzt ist (≥ 32 Zeichen) und (2) noch KEIN
 * Konto existiert. Danach antwortet sie mit 404 – für immer, auch wenn das Token stehen bleibt.
 * Das Passwort wählt der Owner selbst; es wird nur gehasht gespeichert.
 */
export const setupTokenSchema = z.string().min(32).max(256);

export function configuredSetupToken(env: Record<string, string | undefined> = process.env): string | null {
  const parsed = setupTokenSchema.safeParse(env.SETUP_TOKEN);
  return parsed.success ? parsed.data : null;
}

export async function ownerExists(db: Db): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(sql`select exists(select 1 from users) as exists`);
  return Boolean(rows[0]?.exists);
}

export function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const setupInputSchema = ownerInputSchema
  .extend({ token: z.string().min(1).max(256), passwordRepeat: z.string() })
  .refine((v) => v.password === v.passwordRepeat, {
    path: ["passwordRepeat"],
    message: "Passwörter stimmen nicht überein",
  });

export type SetupResult = { ok: true } | { ok: false; error: string };

export async function runInitialSetup(
  auth: Auth,
  db: Db,
  raw: unknown,
  expectedToken: string | null,
): Promise<SetupResult> {
  if (!expectedToken) return { ok: false, error: "Die Einrichtung ist nicht aktiviert." };
  const parsed = setupInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Eingaben prüfen." };
  if (!tokenMatches(parsed.data.token, expectedToken)) return { ok: false, error: "Einrichtungsschlüssel ist falsch." };

  // Gleichzeitige Versuche serialisieren; danach erneut prüfen, dass noch niemand existiert.
  return db.transaction(async (tx) => {
    // try_lock statt Warten: ein wartender Versuch würde eine Pool-Verbindung blockieren.
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext('dev-portfolio:initial-setup')) as locked`,
    );
    if (!lock?.locked) return { ok: false as const, error: "Die Einrichtung läuft bereits – bitte kurz warten." };
    if (await ownerExists(tx as unknown as Db))
      return { ok: false as const, error: "Die Einrichtung ist bereits abgeschlossen." };
    await createOwner(auth, db, { email: parsed.data.email, name: parsed.data.name, password: parsed.data.password });
    return { ok: true as const };
  });
}
