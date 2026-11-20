import "server-only";
import { serverEnv } from "@/lib/config/server-env";

/** Schreibende API-Aufrufe: nur von der eigenen Origin (CSRF-Schutz). */
export function sameOrigin(request: Request): boolean {
  const expected = new URL(serverEnv().APP_URL).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  return origin === expected;
}

/**
 * Lesende Aufrufe (z. B. Bilder): Browser senden bei `<img>` keinen Origin-Header, aber
 * `Sec-Fetch-Site`. Fremde Seiten dürfen Dateien nicht einbetten (Hotlinking, XS-Leaks).
 * Direkter Aufruf (Adresszeile: `none`) bleibt erlaubt.
 */
export function notCrossSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}
