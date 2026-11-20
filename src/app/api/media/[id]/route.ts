import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { notCrossSite } from "@/lib/security/same-origin";
import { getStorage } from "@/lib/storage";
import { getOwner } from "@/modules/auth/session";
import { MediaNotFoundError, openMedia } from "@/modules/media/service";
import { mediaResponseHeaders } from "@/modules/media/http";

/** Liefert eine eigene Mediendatei an den angemeldeten Owner aus (Workspace, Editor, Vorschau). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!notCrossSite(request)) return new NextResponse(null, { status: 403 });
  const owner = await getOwner();
  if (!owner) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  try {
    const { stream, size, asset } = await openMedia(getDb(), getStorage(), owner.actor, id);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(stream, {
      headers: mediaResponseHeaders({
        mimeType: asset.mimeType!,
        size,
        filename: asset.originalFilename ?? "datei",
        inline: asset.kind === "image" && !download,
        cache: "private, max-age=3600",
      }),
    });
  } catch (error) {
    if (error instanceof MediaNotFoundError) return new NextResponse(null, { status: 404 });
    throw error;
  }
}
