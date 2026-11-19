import "server-only";
import { serverEnv } from "@/lib/config/server-env";
import { getDb } from "@/lib/db/client";
import { createAuth, type Auth } from "./auth";

const globalForAuth = globalThis as unknown as { __auth?: Auth };

/** Prozessweite Better-Auth-Instanz (lazy, damit Builds ohne Secrets funktionieren). */
export function getAuth(): Auth {
  globalForAuth.__auth ??= createAuth(getDb(), serverEnv());
  return globalForAuth.__auth;
}
