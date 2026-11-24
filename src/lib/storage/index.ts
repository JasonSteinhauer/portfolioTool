import "server-only";
import { createStorageFromEnv } from "./factory";
import type { StoragePort } from "./local";

export { storageKeyFor, type StoragePort } from "./local";

let instance: StoragePort | undefined;

/** Speicher der laufenden App (lokal oder R2, siehe `factory.ts`). */
export function getStorage(): StoragePort {
  instance ??= createStorageFromEnv(process.env);
  return instance;
}
