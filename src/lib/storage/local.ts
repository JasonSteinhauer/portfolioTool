import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

/**
 * Speicher für Mediendateien. Heute lokal auf der Platte, beim Deployment Cloudflare R2
 * (S3-kompatibel) – die Fachlogik kennt nur diesen Port.
 *
 * Schlüssel sind inhaltsadressiert (`sha256/ab/<hash>`) und damit unveränderlich: dieselbe Datei
 * kann gefahrlos von Entwurf und freigegebenen Snapshots gleichzeitig referenziert werden.
 */
export interface StoragePort {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** `null`, wenn es den Schlüssel nicht gibt. */
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/;

export function storageKeyFor(sha256: string): string {
  const key = `sha256/${sha256.slice(0, 2)}/${sha256}`;
  if (!KEY_PATTERN.test(key)) throw new Error("Ungültiger Speicherschlüssel");
  return key;
}

export class LocalStorage implements StoragePort {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Ungültiger Speicherschlüssel");
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error("Pfad außerhalb des Speichers");
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    // Erst in eine temporäre Datei, dann atomar umbenennen – nie halb geschriebene Dateien.
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, target);
  }

  async get(key: string) {
    const target = this.path(key);
    try {
      const info = await stat(target);
      const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;
      return { stream, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
