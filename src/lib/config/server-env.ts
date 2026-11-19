import "server-only";
import { parseEnv, type Env } from "./env";

let cached: Env | undefined;

/** Liefert die validierte Server-Konfiguration (lazy, damit Builds ohne DB-Zugang möglich sind). */
export function serverEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
