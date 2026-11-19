import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/config/server-env";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

/** Erstellt eine DB-Verbindung. In Serverless-Umgebungen klein halten (wenige Verbindungen). */
export function createDatabase(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, {
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Neon (und andere Pooler im Transaction-Mode) unterstützen keine Prepared Statements.
    prepare: false,
  });
  return { db: drizzle(sql, { schema }), sql };
}

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDatabase> };

/** Gemeinsame Verbindung pro Prozess (übersteht Hot Reload in der Entwicklung). */
export function getDb(): Database {
  globalForDb.__db ??= createDatabase(serverEnv().DATABASE_URL);
  return globalForDb.__db.db;
}
