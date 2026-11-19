import { createHmac } from "node:crypto";

/**
 * Ermittelt die Client-IP. Auf Vercel setzt die Plattform `x-forwarded-for` selbst
 * (der erste Eintrag ist der echte Client); lokal fehlt der Header meist.
 * Ergebnis wird nur gehasht verwendet (Rate-Limits, Audit) – nie im Klartext geloggt.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(candidate) ? candidate : "unknown";
}

/** Pseudonymisiert Identifikatoren (IP, E-Mail) mit HMAC – nicht umkehrbar ohne Secret. */
export function hashIdentifier(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}
