import { z } from "zod";
import { LocalStorage, type StoragePort } from "./local";
import { R2Storage } from "./r2";

/**
 * Wählt den Medienspeicher anhand der Umgebung:
 *   MEDIA_STORAGE=local (Standard) → MEDIA_STORAGE_DIR
 *   MEDIA_STORAGE=r2               → R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
const storageEnvSchema = z.discriminatedUnion("MEDIA_STORAGE", [
  z.object({ MEDIA_STORAGE: z.literal("local"), MEDIA_STORAGE_DIR: z.string().min(1).default(".data/media") }),
  z.object({
    MEDIA_STORAGE: z.literal("r2"),
    R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/, "32 Hex-Zeichen"),
    R2_ACCESS_KEY_ID: z.string().min(16),
    R2_SECRET_ACCESS_KEY: z.string().min(32),
    R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  }),
]);

export function createStorageFromEnv(env: Record<string, string | undefined>): StoragePort {
  const parsed = storageEnvSchema.safeParse({ ...env, MEDIA_STORAGE: env.MEDIA_STORAGE || "local" });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ungültige Speicher-Konfiguration:\n${issues}`);
  }
  const config = parsed.data;
  if (config.MEDIA_STORAGE === "r2") {
    return new R2Storage({
      accountId: config.R2_ACCOUNT_ID,
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      bucket: config.R2_BUCKET,
    });
  }
  return new LocalStorage(config.MEDIA_STORAGE_DIR);
}
