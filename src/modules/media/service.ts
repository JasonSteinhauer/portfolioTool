import { createHash } from "node:crypto";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import sharp from "sharp";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { storageKeyFor, type StoragePort } from "@/lib/storage/local";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Upload-Pipeline:
 *   1. Größe prüfen, Typ anhand der Magic Bytes erkennen (Dateiname/Content-Type zählen nicht).
 *   2. Bilder werden mit sharp neu kodiert: Metadaten (EXIF, GPS, Kamera) entfernt, Ausrichtung
 *      angewandt, auf max. 3840 px begrenzt. Ausgeliefert wird nur das neu kodierte Bild.
 *   3. PDFs werden auf aktive Inhalte geprüft, Textdateien auf gültiges UTF-8.
 *   4. Erst danach wird gespeichert (inhaltsadressiert, dedupliziert pro Owner).
 * Unvalidierte Bytes erreichen den Speicher nie („Quarantäne“ = nur im Arbeitsspeicher).
 */
export const MEDIA_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 50_000_000,
  maxEdge: 3840,
  maxFilenameLength: 200,
} as const;

export const ACCEPT_ATTRIBUTE =
  "image/png,image/jpeg,image/webp,application/pdf,.txt,.log,.csv,.json,.md,.kql,.yaml,.yml";

const TEXT_EXTENSIONS: Record<string, string> = {
  txt: "text/plain",
  log: "text/plain",
  md: "text/plain",
  kql: "text/plain",
  yaml: "text/plain",
  yml: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

/** Muster für aktive Inhalte in PDFs – solche Dateien werden abgelehnt. */
const PDF_ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData)\b/;

export class MediaRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaRejectedError";
  }
}
export class MediaNotFoundError extends Error {
  constructor() {
    super("Mediendatei nicht gefunden");
    this.name = "MediaNotFoundError";
  }
}
export class MediaInUseError extends Error {
  constructor(public readonly reports: { id: string; title: string }[]) {
    super("Mediendatei wird noch verwendet");
    this.name = "MediaInUseError";
  }
}

export type ProcessedUpload = {
  kind: "image" | "document";
  mimeType: string;
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
};

type ImageFormat = "png" | "jpeg" | "webp";

export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

/** Prüft und bereinigt eine Datei. Rein funktional – schreibt nichts. */
export async function processUpload(input: Uint8Array, filename: string): Promise<ProcessedUpload> {
  if (input.byteLength === 0) throw new MediaRejectedError("Die Datei ist leer.");
  if (input.byteLength > MEDIA_LIMITS.maxBytes) throw new MediaRejectedError("Die Datei ist größer als 10 MB.");

  const image = detectImageFormat(input);
  if (image) {
    try {
      let pipeline = sharp(input, { limitInputPixels: MEDIA_LIMITS.maxPixels, failOn: "error", animated: false })
        .rotate()
        .resize({ width: MEDIA_LIMITS.maxEdge, height: MEDIA_LIMITS.maxEdge, fit: "inside", withoutEnlargement: true });
      pipeline =
        image === "png"
          ? pipeline.png({ compressionLevel: 9 })
          : image === "jpeg"
            ? pipeline.jpeg({ quality: 85, mozjpeg: true })
            : pipeline.webp({ quality: 85 });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      return {
        kind: "image",
        mimeType: `image/${image}`,
        bytes: new Uint8Array(data),
        width: info.width,
        height: info.height,
      };
    } catch {
      throw new MediaRejectedError("Das Bild ist beschädigt, zu groß oder kein gültiges PNG/JPEG/WebP.");
    }
  }

  const head = new TextDecoder("latin1").decode(input.subarray(0, 8));
  if (head.startsWith("%PDF-")) {
    const text = new TextDecoder("latin1").decode(input);
    if (!text.trimEnd().endsWith("%%EOF") && !text.slice(-1024).includes("%%EOF"))
      throw new MediaRejectedError("Das PDF ist unvollständig.");
    if (PDF_ACTIVE_CONTENT.test(text))
      throw new MediaRejectedError(
        "PDFs mit aktiven Inhalten (Skripte, eingebettete Dateien, Formulare) sind nicht erlaubt.",
      );
    return { kind: "document", mimeType: "application/pdf", bytes: input, width: null, height: null };
  }

  const textType = TEXT_EXTENSIONS[extensionOf(filename)];
  if (textType) {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new MediaRejectedError("Textdateien müssen UTF-8-kodiert sein.");
    }
    if (decoded.includes("\u0000")) throw new MediaRejectedError("Die Textdatei enthält Binärdaten.");
    if (textType === "application/json") {
      try {
        JSON.parse(decoded);
      } catch {
        throw new MediaRejectedError("Die JSON-Datei ist ungültig.");
      }
    }
    return { kind: "document", mimeType: textType, bytes: input, width: null, height: null };
  }

  throw new MediaRejectedError("Dateityp nicht erlaubt. Erlaubt: PNG, JPEG, WebP, PDF und Textdateien.");
}

/** Dateiname ohne Pfad und Steuerzeichen – wird nur angezeigt, nie als Pfad verwendet. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f"<>]/g, "")
    .trim()
    .slice(0, MEDIA_LIMITS.maxFilenameLength);
  return clean || "datei";
}

const columns = {
  id: schema.mediaAssets.id,
  ownerId: schema.mediaAssets.ownerId,
  kind: schema.mediaAssets.kind,
  mimeType: schema.mediaAssets.mimeType,
  sizeBytes: schema.mediaAssets.sizeBytes,
  width: schema.mediaAssets.width,
  height: schema.mediaAssets.height,
  originalFilename: schema.mediaAssets.originalFilename,
  title: schema.mediaAssets.title,
  altText: schema.mediaAssets.altText,
  storageKey: schema.mediaAssets.storageKey,
  createdAt: schema.mediaAssets.createdAt,
  deletedAt: schema.mediaAssets.deletedAt,
};

export type MediaAsset = {
  id: string;
  ownerId: string;
  kind: "image" | "document" | "code" | "link";
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  title: string | null;
  altText: string | null;
  storageKey: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

/** Für Client-Komponenten: ohne Speicherschlüssel und Owner. */
export type MediaSummary = Pick<
  MediaAsset,
  "id" | "kind" | "mimeType" | "sizeBytes" | "width" | "height" | "originalFilename" | "title" | "altText"
>;

export function toSummary(asset: MediaAsset): MediaSummary {
  const { id, kind, mimeType, sizeBytes, width, height, originalFilename, title, altText } = asset;
  return { id, kind, mimeType, sizeBytes, width, height, originalFilename, title, altText };
}

const metaSchema = z
  .object({
    title: z.string().trim().max(200).default(""),
    altText: z.string().trim().max(300).default(""),
  })
  .strict();

export async function uploadMedia(
  db: Db,
  storage: StoragePort,
  actor: Actor,
  input: { bytes: Uint8Array; filename: string; title?: string; altText?: string },
): Promise<{ asset: MediaAsset; duplicate: boolean }> {
  assertCan(actor, "media:create");
  const meta = metaSchema.parse({ title: input.title ?? "", altText: input.altText ?? "" });
  const filename = sanitizeFilename(input.filename);
  const processed = await processUpload(input.bytes, filename);
  const sha256 = createHash("sha256").update(processed.bytes).digest("hex");

  const [existing] = await db
    .select(columns)
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.ownerId, actor.userId), eq(schema.mediaAssets.sha256, sha256)));
  if (existing) {
    if (existing.deletedAt) {
      const [restored] = await db
        .update(schema.mediaAssets)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(schema.mediaAssets.id, existing.id))
        .returning(columns);
      return { asset: restored, duplicate: true };
    }
    return { asset: existing, duplicate: true };
  }

  const storageKey = storageKeyFor(sha256);
  await storage.put(storageKey, processed.bytes);

  const [asset] = await db
    .insert(schema.mediaAssets)
    .values({
      ownerId: actor.userId,
      kind: processed.kind,
      sha256,
      storageKey,
      mimeType: processed.mimeType,
      sizeBytes: processed.bytes.byteLength,
      width: processed.width,
      height: processed.height,
      originalFilename: filename,
      title: meta.title || filename.replace(/\.[^.]+$/, ""),
      altText: meta.altText,
    })
    .returning(columns);

  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "media.uploaded",
    targetType: "media",
    targetId: asset.id,
    metadata: { kind: asset.kind, mimeType: processed.mimeType, sizeBytes: processed.bytes.byteLength },
  });
  return { asset, duplicate: false };
}

export async function listMedia(
  db: Db,
  actor: Actor,
  options: { kind?: "image" | "document"; query?: string; trash?: boolean } = {},
): Promise<MediaAsset[]> {
  assertCan(actor, "media:read");
  const q = options.query?.trim();
  return db
    .select(columns)
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.ownerId, actor.userId),
        options.trash ? isNotNull(schema.mediaAssets.deletedAt) : isNull(schema.mediaAssets.deletedAt),
        options.kind ? eq(schema.mediaAssets.kind, options.kind) : undefined,
        q
          ? or(
              ilike(schema.mediaAssets.title, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
              ilike(schema.mediaAssets.originalFilename, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
              ilike(schema.mediaAssets.altText, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.mediaAssets.createdAt))
    .limit(500);
}

/** Liefert ein Asset des Actors (auch im Papierkorb, wenn `includeDeleted`). Fremde IDs → NotFound. */
export async function getMedia(
  db: Db,
  actor: Actor,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<MediaAsset> {
  if (!z.uuid().safeParse(id).success) throw new MediaNotFoundError();
  const [asset] = await db
    .select(columns)
    .from(schema.mediaAssets)
    .where(
      and(eq(schema.mediaAssets.id, id), options.includeDeleted ? undefined : isNull(schema.mediaAssets.deletedAt)),
    );
  if (!asset || asset.ownerId !== actor.userId) throw new MediaNotFoundError();
  assertCan(actor, "media:read", { ownerId: asset.ownerId });
  return asset;
}

export async function updateMedia(db: Db, actor: Actor, id: string, raw: unknown): Promise<MediaAsset> {
  const asset = await getMedia(db, actor, id);
  assertCan(actor, "media:update", { ownerId: asset.ownerId });
  const input = metaSchema.parse(raw);
  const [updated] = await db
    .update(schema.mediaAssets)
    .set({ title: input.title || asset.title, altText: input.altText, updatedAt: new Date() })
    .where(eq(schema.mediaAssets.id, id))
    .returning(columns);
  return updated;
}

/** Reports (nicht im Papierkorb), die das Asset verwenden. */
export async function listMediaUsage(db: Db, actor: Actor, id: string): Promise<{ id: string; title: string }[]> {
  const asset = await getMedia(db, actor, id, { includeDeleted: true });
  const rows = await db
    .selectDistinct({ id: schema.reports.id, title: schema.reports.title })
    .from(schema.reportMedia)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportMedia.reportId))
    .where(and(eq(schema.reportMedia.mediaAssetId, asset.id), isNull(schema.reports.deletedAt)));
  return rows;
}

/** Nutzungszähler für die Mediathek (eine Abfrage für alle Assets). */
export async function countMediaUsage(db: Db, actor: Actor): Promise<Map<string, number>> {
  assertCan(actor, "media:read");
  const rows = await db
    .select({
      id: schema.reportMedia.mediaAssetId,
      count: sql<number>`count(distinct ${schema.reportMedia.reportId})::int`,
    })
    .from(schema.reportMedia)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportMedia.reportId))
    .where(and(eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt)))
    .groupBy(schema.reportMedia.mediaAssetId);
  return new Map(rows.map((r) => [r.id, r.count]));
}

export async function moveMediaToTrash(db: Db, actor: Actor, id: string): Promise<void> {
  const asset = await getMedia(db, actor, id);
  assertCan(actor, "media:delete", { ownerId: asset.ownerId });
  const usage = await listMediaUsage(db, actor, id);
  if (usage.length > 0) throw new MediaInUseError(usage);
  await db
    .update(schema.mediaAssets)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.mediaAssets.id, id));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "media.deleted",
    targetType: "media",
    targetId: id,
  });
}

export async function restoreMedia(db: Db, actor: Actor, id: string): Promise<void> {
  const asset = await getMedia(db, actor, id, { includeDeleted: true });
  assertCan(actor, "media:update", { ownerId: asset.ownerId });
  await db
    .update(schema.mediaAssets)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(schema.mediaAssets.id, id));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "media.restored",
    targetType: "media",
    targetId: id,
  });
}

/** Öffnet die Datei eines eigenen Assets zum Ausliefern. */
export async function openMedia(db: Db, storage: StoragePort, actor: Actor, id: string) {
  const asset = await getMedia(db, actor, id, { includeDeleted: true });
  if (!asset.storageKey || !asset.mimeType) throw new MediaNotFoundError();
  const file = await storage.get(asset.storageKey);
  if (!file) throw new MediaNotFoundError();
  return { ...file, asset };
}
