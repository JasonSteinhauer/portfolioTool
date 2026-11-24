import type { MediaSummary } from "@/modules/media/service";

export type UploadResult = { ok: true; asset: MediaSummary; duplicate: boolean } | { ok: false; message: string };

const MAX_BYTES = 10 * 1024 * 1024;

/** Lädt eine Datei über die Upload-API hoch (Client). Prüft die Größe vorab für schnelle Rückmeldung. */
export async function uploadFile(file: File, meta: { altText?: string } = {}): Promise<UploadResult> {
  if (file.size > MAX_BYTES) return { ok: false, message: "Die Datei ist größer als 10 MB." };
  const body = new FormData();
  body.set("file", file);
  if (meta.altText) body.set("altText", meta.altText);
  try {
    const response = await fetch("/api/media", { method: "POST", body, credentials: "same-origin" });
    const data = (await response.json().catch(() => null)) as
      { ok: true; asset: MediaSummary; duplicate: boolean } | { ok: false; message?: string } | null;
    if (data?.ok) return data;
    if (response.status === 401) return { ok: false, message: "Sitzung abgelaufen – bitte neu anmelden." };
    return { ok: false, message: (data && !data.ok && data.message) || "Upload fehlgeschlagen." };
  } catch {
    return { ok: false, message: "Keine Verbindung – Upload fehlgeschlagen." };
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}
