import "server-only";
import { LocalStorage, type StoragePort } from "./local";

export { storageKeyFor, type StoragePort } from "./local";

let instance: StoragePort | undefined;

/** Speicher der laufenden App (`MEDIA_STORAGE_DIR`, Standard `.data/media`). */
export function getStorage(): StoragePort {
  instance ??= new LocalStorage(process.env.MEDIA_STORAGE_DIR || ".data/media");
  return instance;
}
