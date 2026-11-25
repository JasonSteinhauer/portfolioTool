import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { notCrossSite } from "@/lib/security/same-origin";
import { getStorage } from "@/lib/storage";
import { getOwner } from "@/modules/auth/session";
import { mediaResponseHeaders } from "@/modules/media/http";
import { getOwnerPublishedMedia } from "@/modules/sharing/service";

/** Eingefrorene Bilder eigener freigegebener Seiten – für die Betrachter-Vorschau (nur Owner). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!notCrossSite(request)) return new NextResponse(null, { status: 403 });
  const owner = await getOwner();
  if (!owner) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const media = await getOwnerPublishedMedia(getDb(), owner.actor, id);
  if (!media) return new NextResponse(null, { status: 404 });
  const file = await getStorage().get(media.storageKey);
  if (!file) return new NextResponse(null, { status: 404 });
  return new Response(file.stream, {
    headers: mediaResponseHeaders({
      mimeType: media.mimeType,
      size: file.size,
      filename: `bild.${media.mimeType.split("/")[1] ?? "bin"}`,
      inline: true,
      cache: "private, max-age=300",
    }),
  });
}
