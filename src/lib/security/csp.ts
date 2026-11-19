/**
 * Baut die Content-Security-Policy. Reine Funktion, damit sie unit-getestet werden kann.
 *
 * - Skripte nur mit Nonce ('strict-dynamic' erlaubt von Next nachgeladene Chunks).
 * - Keine externen Quellen: Schriften und Bilder kommen von der eigenen Origin.
 * - 'unsafe-eval' und Inline-Styles nur in der Entwicklung, nie in Produktion.
 */
export function buildContentSecurityPolicy({ nonce, isDev }: { nonce: string; isDev: boolean }): string {
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(nonce)) {
    throw new Error("Ungültige CSP-Nonce");
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Dev: Turbopack injiziert CSS inline (HMR). Neben einer Nonce würde 'unsafe-inline'
    // ignoriert, daher in Dev ohne Nonce. Produktion bleibt strikt (verifiziert: 0 Verstöße).
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
