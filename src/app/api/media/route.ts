import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { sameOrigin } from "@/lib/security/same-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getStorage } from "@/lib/storage";
import { getOwner } from "@/modules/auth/session";
import { MEDIA_LIMITS, MediaRejectedError, toSummary, uploadMedia } from "@/modules/media/service";

/**
 * Upload einer Datei (multipart/form-data, Feld `file`, optional `title`, `altText`).
 * Schutz: Same-Origin, Owner-Session, Größenlimit vor dem Einlesen, Rate-Limit, Prüfung im Service.
 */
const MAX_REQUEST_BYTES = MEDIA_LIMITS.maxBytes + 64 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return NextResponse.json({ ok: false, reason: "unsupported" }, { status: 415 });
  }
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { ok: false, reason: "too_large", message: "Die Datei ist größer als 10 MB." },
      { status: 413 },
    );
  }

  const db = getDb();
  const limit = await consumeRateLimit(db, `media:upload:${owner.actor.userId}`, { limit: 120, windowMs: 60 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", message: "Zu viele Uploads – bitte später erneut." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid", message: "Ungültige Anfrage." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, reason: "invalid", message: "Keine Datei ausgewählt." }, { status: 400 });
  }
  if (file.size > MEDIA_LIMITS.maxBytes) {
    return NextResponse.json(
      { ok: false, reason: "too_large", message: "Die Datei ist größer als 10 MB." },
      { status: 413 },
    );
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : undefined;
  };

  try {
    const { asset, duplicate } = await uploadMedia(db, getStorage(), owner.actor, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      title: text("title"),
      altText: text("altText"),
    });
    return NextResponse.json(
      { ok: true, duplicate, asset: toSummary(asset) },
      { status: duplicate ? 200 : 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MediaRejectedError) {
      return NextResponse.json({ ok: false, reason: "rejected", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
