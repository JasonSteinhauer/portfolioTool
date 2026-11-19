import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";
import { seedReportTypes } from "../../src/lib/db/seed";
import { createAuth } from "../../src/modules/auth/auth";
import { createOwner } from "../../src/modules/auth/owner";
import { E2E_ENV, E2E_OWNERS, E2E_PASSWORD } from "./env";

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
  await sql.end();
}
