/**
 * Antwort-Header für ausgelieferte Dateien – gemeinsam für Workspace und Viewer.
 *
 * - `nosniff` + fester Content-Type: der Browser rät nie selbst.
 * - Eigene, restriktive CSP mit `sandbox`: selbst ein direkt geöffnetes PDF/Textfile kann kein
 *   Skript im Kontext der App ausführen.
 * - Nicht-Bilder immer als Download.
 */
export function mediaResponseHeaders(input: {
  mimeType: string;
  size: number;
  filename: string;
  inline: boolean;
  cache: string;
}): Headers {
  const ascii = input.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(input.filename);
  const type =
    input.mimeType.startsWith("text/") || input.mimeType === "application/json"
      ? `${input.mimeType}; charset=utf-8`
      : input.mimeType;
  return new Headers({
    "content-type": type,
    "content-length": String(input.size),
    "content-disposition": `${input.inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": input.cache,
    "x-robots-tag": "noindex",
  });
}
