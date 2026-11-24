/**
 * Verschlüsselte Backups (DB + Medien) und Wiederherstellung.
 *
 *   BACKUP_PASSPHRASE=… pnpm backup [--out backups/]
 *   BACKUP_PASSPHRASE=… pnpm restore --file backups/portfolio-….dpbak --confirm
 *
 * Die Passphrase kommt bewusst NUR aus der Umgebung (nicht als Argument → nicht in der Shell-History).
 * Wiederherstellung nur in eine leere, migrierte Datenbank (`pnpm db:migrate` vorher).
 * Die .dpbak-Datei kann z. B. in Proton Drive abgelegt werden – sie ist Ende-zu-Ende verschlüsselt.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { createStorageFromEnv } from "../src/lib/storage/factory";
import { createBackup, restoreBackup } from "../src/modules/backup/service";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const command = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: { out: { type: "string", default: "backups" }, file: { type: "string" }, confirm: { type: "boolean" } },
  });
  const url = process.env.DATABASE_URL;
  const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
  if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");
  if (!passphrase)
    throw new Error("BACKUP_PASSPHRASE fehlt (mind. 16 Zeichen, sicher aufbewahren – ohne sie ist das Backup wertlos)");

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const storage = createStorageFromEnv(process.env);
  try {
    if (command === "create") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputFile = resolve(join(values.out!, `portfolio-${stamp}.dpbak`));
      const manifest = await createBackup(db, storage, { outputFile, passphrase });
      const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
      console.log(`✓ Backup erstellt: ${outputFile}\n  ${rows} Datensätze, ${manifest.media} Mediendateien`);
    } else if (command === "restore") {
      if (!values.file) throw new Error("--file fehlt");
      if (!values.confirm) throw new Error("Zur Sicherheit mit --confirm bestätigen (nur in eine leere Datenbank).");
      const manifest = await restoreBackup(db, storage, { inputFile: resolve(values.file), passphrase });
      console.log(`✓ Wiederhergestellt: Backup vom ${manifest.createdAt}, ${manifest.media} Mediendateien`);
      console.log("  Hinweis: Sitzungen werden nicht gesichert – bitte neu anmelden.");
    } else {
      throw new Error(`Unbekannter Befehl "${command}". Erlaubt: create, restore`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
