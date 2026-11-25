import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as tar from "tar";
import * as schema from "@/lib/db/schema";
import type { StoragePort } from "@/lib/storage/local";

type Db = PostgresJsDatabase<typeof schema>;
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: object,
) => Promise<Buffer>;

/**
 * Verschlüsseltes Voll-Backup: alle fachlichen Tabellen + alle Mediendateien.
 *
 * Format `.dpbak`: "DPBAK1" | Salt (16) | IV (12) | AES-256-GCM(tar.gz) | Auth-Tag (16).
 * Schlüssel per scrypt aus einer Passphrase (≥ 16 Zeichen). Das Backup enthält Passwort-Hashes und
 * verschlüsselte 2FA-Secrets – deshalb ist Verschlüsselung Pflicht.
 *
 * Nicht gesichert: Sitzungen, Verifizierungen, Rate-Limits (flüchtig; nach Restore neu anmelden).
 * Wiederhergestellt wird nur in eine LEERE, migrierte Datenbank – ein Restore überschreibt nie Daten.
 */
export const BACKUP_FORMAT = "dev-portfolio-backup";
export const BACKUP_VERSION = 1;
const MAGIC = Buffer.from("DPBAK1");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** In Abhängigkeitsreihenfolge (Fremdschlüssel). Ohne sessions, verifications, rate_limits. */
export const BACKUP_TABLES = [
  "users",
  "accounts",
  "two_factors",
  "subject_areas",
  "competencies",
  "projects",
  "report_types",
  "reports",
  "report_versions",
  "report_competencies",
  "report_links",
  "media_assets",
  "report_media",
  "portfolio_pages",
  "published_snapshots",
  "published_media",
  "favorites",
  "collections",
  "collection_items",
  "share_links",
  "ai_jobs",
  "ai_proposals",
  "audit_events",
] as const;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export type Manifest = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  migration: string | null;
  tables: Record<string, number>;
  media: number;
};

function assertPassphrase(passphrase: string) {
  if (passphrase.length < 16) throw new BackupError("Die Passphrase muss mindestens 16 Zeichen lang sein.");
}

async function latestMigration(db: Db): Promise<string | null> {
  const rows = await db.execute<{ hash: string }>(
    sql`select hash from drizzle.__drizzle_migrations order by created_at desc, id desc limit 1`,
  );
  return rows[0]?.hash ?? null;
}

async function encryptFile(input: string, output: string, passphrase: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(output, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(input), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) =>
    out.end(cipher.getAuthTag(), (err?: Error | null) => (err ? reject(err) : resolve())),
  );
}

async function decryptFile(input: string, output: string, passphrase: string) {
  const size = (await stat(input)).size;
  const headerLength = MAGIC.length + 16 + 12;
  if (size < headerLength + 16) throw new BackupError("Die Datei ist kein gültiges Backup.");
  const handle = await open(input, "r");
  try {
    const header = Buffer.alloc(headerLength);
    await handle.read(header, 0, headerLength, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError("Die Datei ist kein gültiges Backup.");
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, size - 16);
    const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
    const iv = header.subarray(MAGIC.length + 16);
    const key = await scrypt(passphrase, salt, 32, SCRYPT);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    try {
      await pipeline(
        createReadStream(input, { start: headerLength, end: size - 17 }),
        decipher,
        createWriteStream(output, { mode: 0o600 }),
      );
    } catch {
      throw new BackupError("Entschlüsselung fehlgeschlagen – falsche Passphrase oder beschädigte Datei.");
    }
  } finally {
    await handle.close();
  }
}

/** Erstellt ein verschlüsseltes Backup unter `outputFile`. */
export async function createBackup(
  db: Db,
  storage: StoragePort,
  options: { outputFile: string; passphrase: string; now?: Date },
): Promise<Manifest> {
  assertPassphrase(options.passphrase);
  const work = await mkdtemp(join(tmpdir(), "dp-backup-"));
  try {
    const root = join(work, "backup");
    await mkdir(join(root, "db"), { recursive: true });
    const tables: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const [row] = await db.execute<{ data: unknown[] }>(
        sql`select coalesce(json_agg(t), '[]'::json) as data from ${sql.identifier(table)} t`,
      );
      const data = row?.data ?? [];
      tables[table] = data.length;
      await writeFile(join(root, "db", `${table}.json`), JSON.stringify(data), { mode: 0o600 });
    }

    const keys = await db.execute<{ key: string }>(
      sql`select distinct storage_key as key from media_assets where storage_key is not null
          union select distinct storage_key from published_media`,
    );
    let media = 0;
    for (const { key } of keys) {
      const file = await storage.get(key);
      if (!file) throw new BackupError(`Mediendatei fehlt im Speicher: ${key}`);
      const target = join(root, "media", key);
      await mkdir(dirname(target), { recursive: true });
      await pipeline(file.stream as unknown as NodeJS.ReadableStream, createWriteStream(target, { mode: 0o600 }));
      media++;
    }

    const manifest: Manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: (options.now ?? new Date()).toISOString(),
      migration: await latestMigration(db),
      tables,
      media,
    };
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));

    const archive = join(work, "backup.tar.gz");
    await tar.create({ gzip: true, file: archive, cwd: root, portable: true }, [
      "manifest.json",
      "db",
      ...(media ? ["media"] : []),
    ]);
    await mkdir(dirname(options.outputFile), { recursive: true });
    await encryptFile(archive, options.outputFile, options.passphrase);
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/**
 * Stellt ein Backup in eine LEERE, auf denselben Stand migrierte Datenbank wieder her.
 * Prüft Integrität (GCM), Format, Migrationsstand und Dateihashes der Medien.
 */
export async function restoreBackup(
  db: Db,
  storage: StoragePort,
  options: { inputFile: string; passphrase: string },
): Promise<Manifest> {
  assertPassphrase(options.passphrase);
  const work = await mkdtemp(join(tmpdir(), "dp-restore-"));
  try {
    const archive = join(work, "backup.tar.gz");
    await decryptFile(options.inputFile, archive, options.passphrase);
    const root = join(work, "backup");
    await mkdir(root);
    await tar.extract({
      file: archive,
      cwd: root,
      strict: true,
      // Nur reguläre Dateien und Ordner; keine Links, keine Pfade außerhalb.
      filter: (path, entry) =>
        !path.includes("..") && ("type" in entry ? ["File", "Directory"].includes(entry.type) : true),
    });

    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as Manifest;
    if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
      throw new BackupError("Unbekanntes Backup-Format.");
    }
    const migration = await latestMigration(db);
    if (manifest.migration !== migration) {
      throw new BackupError("Die Datenbank hat einen anderen Migrationsstand als das Backup. Erst passend migrieren.");
    }
    const [{ users }] = await db.execute<{ users: number }>(sql`select count(*)::int as users from users`);
    const [{ reports }] = await db.execute<{ reports: number }>(sql`select count(*)::int as reports from reports`);
    if (users > 0 || reports > 0) {
      throw new BackupError("Die Zieldatenbank ist nicht leer. Wiederherstellung nur in eine leere Datenbank.");
    }

    // Medien zuerst prüfen und schreiben (inhaltsadressiert: Hash muss zum Schlüssel passen).
    const mediaRoot = join(root, "media");
    for (const rel of await listFiles(mediaRoot)) {
      const match = /^sha256\/[0-9a-f]{2}\/([0-9a-f]{64})$/.exec(rel);
      if (!match) throw new BackupError(`Unerwartete Datei im Backup: ${rel}`);
      const bytes = await readFile(join(mediaRoot, rel));
      if (createHash("sha256").update(bytes).digest("hex") !== match[1]) {
        throw new BackupError(`Mediendatei beschädigt: ${rel}`);
      }
      await storage.put(rel, new Uint8Array(bytes));
    }

    await db.transaction(async (tx) => {
      // Seed-Typen der frischen DB durch die gesicherten ersetzen (IDs müssen passen).
      await tx.execute(sql`delete from report_types`);
      for (const table of BACKUP_TABLES) {
        const json = await readFile(join(root, "db", `${table}.json`), "utf8");
        const rows = JSON.parse(json) as unknown[];
        if (rows.length !== manifest.tables[table]) throw new BackupError(`Tabelle ${table} ist unvollständig.`);
        if (rows.length === 0) continue;
        // Generierte Spalten (z. B. Suchindex) werden von Postgres neu berechnet.
        const columns = await tx.execute<{ name: string }>(
          sql`select column_name as name from information_schema.columns
              where table_schema = 'public' and table_name = ${table} and is_generated = 'NEVER'
              order by ordinal_position`,
        );
        const list = sql.join(
          columns.map((c) => sql.identifier(c.name)),
          sql`, `,
        );
        await tx.execute(
          sql`insert into ${sql.identifier(table)} (${list}) select ${list} from json_populate_recordset(null::${sql.identifier(table)}, ${json}::json)`,
        );
      }
    });
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
