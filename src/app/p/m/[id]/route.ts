import { notCrossSite } from "@/lib/security/same-origin";
import { getDb } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { mediaResponseHeaders } from "@/modules/media/http";
import { getViewerMedia } from "@/modules/sharing/service";
import { getViewerLink } from "@/modules/sharing/viewer";

/**
 * Bilder freigegebener Seiten. Prüft bei jedem Abruf den Link (Cookie, Pfad /p) und dass das Bild
 * zum aktuellen Snapshot einer Seite im Link-Umfang gehört. Kein öffentlicher Cache.
 */
const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!notCrossSite(request)) return new Response(null, { status: 403 });
  const link = await getViewerLink();
  if (!link) return NOT_FOUND();
  const { id } = await params;
  const media = await getViewerMedia(getDb(), link, id);
  if (!media) return NOT_FOUND();
  const file = await getStorage().get(media.storageKey);
  if (!file) return NOT_FOUND();
  return new Response(file.stream, {
    headers: mediaResponseHeaders({
      mimeType: media.mimeType,
      size: file.size,
      filename: `bild.${media.mimeType.split("/")[1] ?? "bin"}`,
      inline: true,
      // privat: nur im Browser des Betrachters, kurz – Widerruf soll schnell greifen.
      cache: "private, max-age=300",
    }),
  });
}
