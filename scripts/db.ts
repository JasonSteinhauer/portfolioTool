/**
 * Datenbank-Werkzeuge für Entwicklung und CI.
 *
 *   pnpm db:migrate   – wendet alle Migrationen aus ./drizzle an
 *   pnpm db:seed      – spielt Standarddaten ein (idempotent)
 *
 * Liest DATABASE_URL aus der Umgebung bzw. aus .env.local.
 */
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { seedReportTypes } from "../src/lib/db/seed";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const command = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  try {
    if (command === "migrate") {
      await migrate(db, { migrationsFolder: "./drizzle" });
      console.log("✓ Migrationen angewendet");
    } else if (command === "seed") {
      const count = await seedReportTypes(db);
      console.log(`✓ ${count} Report-Typen eingespielt`);
    } else {
      throw new Error(`Unbekannter Befehl "${command}". Erlaubt: migrate, seed`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
