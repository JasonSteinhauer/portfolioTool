import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

/**
 * Legt pro Testlauf eine frische Datenbank an, wendet ALLE Migrationen an und löscht sie
 * danach wieder. So testen wir genau das, was später in Produktion migriert wird.
 */
export default async function setup(project: TestProject) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("TEST_DATABASE_URL fehlt – Integrationstests brauchen einen Postgres-Server (siehe README).");
  }

  const dbName = `portfolio_test_${Date.now()}_${process.pid}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const testUrl = url.toString();

  const sql = postgres(testUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();

  project.provide("testDatabaseUrl", testUrl);

  return async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}
