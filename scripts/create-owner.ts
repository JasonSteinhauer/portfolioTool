/**
 * Legt das Owner-Konto an:
 *
 *   pnpm owner:create --email du@example.org --name "Dein Name"
 *
 * Das Passwort wird verdeckt abgefragt (oder für CI/Tests aus OWNER_PASSWORD gelesen).
 * Beim ersten Login wird die Einrichtung der Zwei-Faktor-Authentifizierung erzwungen.
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { parseEnv } from "../src/lib/config/env";
import * as schema from "../src/lib/db/schema";
import { createAuth } from "../src/modules/auth/auth";
import { createOwner, OwnerAlreadyExistsError } from "../src/modules/auth/owner";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  if (!values.email || !values.name) {
    throw new Error('Aufruf: pnpm owner:create --email <adresse> --name "<Name>"');
  }

  let password = process.env.OWNER_PASSWORD;
  if (!password) {
    password = await promptHidden("Passwort (min. 12 Zeichen): ");
    const repeat = await promptHidden("Passwort wiederholen: ");
    if (password !== repeat) throw new Error("Die Passwörter stimmen nicht überein.");
  }

  const env = parseEnv(process.env);
  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  try {
    const owner = await createOwner(createAuth(db, env), db, { email: values.email, name: values.name, password });
    console.log(`✓ Owner angelegt: ${owner.email}. Beim ersten Login wird 2FA eingerichtet.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof OwnerAlreadyExistsError) console.error(error.message);
  else if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { path: unknown[]; message: string }[] }).issues;
    console.error(issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
  } else console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
