import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import { LocalStorage } from "@/lib/storage/local";
import type { Actor } from "@/modules/auth/policy";
import {
  getMedia,
  listMedia,
  listMediaUsage,
  MediaInUseError,
  MediaNotFoundError,
  MediaRejectedError,
  moveMediaToTrash,
  openMedia,
  processUpload,
  restoreMedia,
  sanitizeFilename,
  updateMedia,
  uploadMedia,
} from "@/modules/media/service";
import {
  createPageFromReport,
  getPage,
  publishPage,
  PublishBlockedError,
  savePage,
  addToShowcase,
} from "@/modules/portfolio/service";
import { createReport, saveReport } from "@/modules/reports/service";
import { createShareLink, getViewerMedia, getViewerPage, resolveShareToken } from "@/modules/sharing/service";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
let dir: string;
let storage: LocalStorage;

const owner: Actor = { type: "user", userId: "user_media_owner", role: "owner" };
const other: Actor = { type: "user", userId: "user_media_other", role: "owner" };

/** Synthetisches Testbild mit EXIF-Daten (inkl. Kamera/Software), die entfernt werden müssen. */
async function pngWithExif(color = "#3366ff", size = 64): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width: size, height: size, channels: 3, background: color } })
    .png()
    .withExif({ IFD0: { Make: "Synthetic Camera", Software: "dev-portfolio-test", Artist: "Max Mustermann" } })
    .toBuffer();
  return new Uint8Array(buffer);
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dp-media-"));
  storage = new LocalStorage(dir);
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: owner.userId, name: "Media Owner", email: "media-owner@example.test" },
    { id: other.userId, name: "Media Other", email: "media-other@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
  await rm(dir, { recursive: true, force: true });
});

describe("Upload-Prüfung", () => {
  it("entfernt Metadaten aus Bildern und liefert Maße", async () => {
    const input = await pngWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processUpload(input, "screenshot.png");
    expect(out).toMatchObject({ kind: "image", mimeType: "image/png", width: 64, height: 64 });
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Buffer.from(out.bytes).includes("Max Mustermann")).toBe(false);
  });

  it("verkleinert sehr große Bilder auf max. 3840 px", async () => {
    const big = await sharp({ create: { width: 5000, height: 1000, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer();
    const out = await processUpload(new Uint8Array(big), "breit.jpg");
    expect(out.width).toBe(3840);
    expect(out.mimeType).toBe("image/jpeg");
  });

  it("erkennt den Typ am Inhalt, nicht am Namen", async () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    await expect(processUpload(html, "bild.png")).rejects.toThrow(MediaRejectedError);
    await expect(processUpload(html, "seite.html")).rejects.toThrow(/nicht erlaubt/);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
    await expect(processUpload(svg, "logo.svg")).rejects.toThrow(MediaRejectedError);
    // PNG-Signatur mit kaputtem Inhalt
    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    await expect(processUpload(broken, "kaputt.png")).rejects.toThrow(/beschädigt/);
  });

  it("lehnt PDFs mit aktiven Inhalten ab und akzeptiert einfache PDFs", async () => {
    const ok = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n");
    expect((await processUpload(ok, "bericht.pdf")).mimeType).toBe("application/pdf");
    for (const active of ["/JavaScript", "/JS (app.alert(1))", "/Launch", "/EmbeddedFiles"]) {
      const pdf = new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /OpenAction << ${active} >> >> endobj\n%%EOF\n`);
      await expect(processUpload(pdf, "x.pdf"), active).rejects.toThrow(/aktiven Inhalten/);
    }
  });

  it("Textdateien nur als gültiges UTF-8 und mit erlaubter Endung", async () => {
    expect((await processUpload(new TextEncoder().encode("SigninLogs | take 10"), "abfrage.kql")).mimeType).toBe(
      "text/plain",
    );
    await expect(processUpload(new Uint8Array([0xff, 0xfe, 0x00]), "x.txt")).rejects.toThrow(/UTF-8/);
    await expect(processUpload(new TextEncoder().encode("{kaputt"), "x.json")).rejects.toThrow(/JSON/);
    await expect(processUpload(new TextEncoder().encode("echo hi"), "x.sh")).rejects.toThrow(/nicht erlaubt/);
  });

  it("begrenzt Größe und bereinigt Dateinamen", async () => {
    await expect(processUpload(new Uint8Array(0), "leer.txt")).rejects.toThrow(/leer/);
    await expect(processUpload(new Uint8Array(10 * 1024 * 1024 + 1), "gross.txt")).rejects.toThrow(/10 MB/);
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename('C:\\temp\\b"ö"se<x>.png')).toBe("bösex.png");
    expect(sanitizeFilename("\u0000\u0001")).toBe("datei");
  });
});

describe("Mediathek", () => {
  it("speichert, dedupliziert und isoliert pro Owner", async () => {
    const bytes = await pngWithExif("#ff0000");
    const first = await uploadMedia(db, storage, owner, { bytes, filename: "rot.png", altText: "Rotes Quadrat" });
    expect(first.duplicate).toBe(false);
    expect(first.asset).toMatchObject({ kind: "image", title: "rot", altText: "Rotes Quadrat" });
    const again = await uploadMedia(db, storage, owner, { bytes, filename: "rot-kopie.png" });
    expect(again).toMatchObject({ duplicate: true, asset: { id: first.asset.id } });

    // Ein anderer Owner bekommt eine eigene Zeile und sieht die erste nicht.
    const foreign = await uploadMedia(db, storage, other, { bytes, filename: "rot.png" });
    expect(foreign.asset.id).not.toBe(first.asset.id);
    await expect(getMedia(db, other, first.asset.id)).rejects.toThrow(MediaNotFoundError);
    await expect(openMedia(db, storage, other, first.asset.id)).rejects.toThrow(MediaNotFoundError);
    expect((await listMedia(db, other)).map((a) => a.id)).not.toContain(first.asset.id);

    const opened = await openMedia(db, storage, owner, first.asset.id);
    const content = await streamToBuffer(opened.stream);
    expect((await sharp(content).metadata()).exif).toBeUndefined();

    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, first.asset.id));
    expect(audit.map((a) => a.action)).toContain("media.uploaded");
  });

  it("Titel/Alt-Text ändern, Suche und Filter", async () => {
    const { asset } = await uploadMedia(db, storage, owner, {
      bytes: new TextEncoder().encode("Log-Auszug (synthetisch)"),
      filename: "auszug.log",
    });
    await updateMedia(db, owner, asset.id, { title: "Firewall-Log", altText: "" });
    expect((await listMedia(db, owner, { query: "firewall" })).map((a) => a.id)).toEqual([asset.id]);
    expect((await listMedia(db, owner, { kind: "document" })).map((a) => a.id)).toContain(asset.id);
    expect((await listMedia(db, owner, { kind: "image" })).map((a) => a.id)).not.toContain(asset.id);
    expect(await listMedia(db, owner, { query: "%" })).toEqual([]);
  });

  it("Reports dürfen nur eigene, nicht gelöschte Medien verwenden; Löschen in Verwendung ist blockiert", async () => {
    const { asset } = await uploadMedia(db, storage, owner, {
      bytes: await pngWithExif("#00aa00"),
      filename: "gruen.png",
    });
    const { asset: foreign } = await uploadMedia(db, storage, other, {
      bytes: await pngWithExif("#aa00aa"),
      filename: "x.png",
    });
    const { id: reportId } = await createReport(db, owner, { typeKey: "case-analysis" });
    const base = { title: "Mit Bild", structuredFields: {}, classification: "publishable", aiAllowed: false } as const;

    const withForeign = await saveReport(db, owner, reportId, {
      ...base,
      revision: 1,
      content: { schemaVersion: 1, blocks: [{ id: "blk_img000000001", type: "image", mediaId: foreign.id, alt: "x" }] },
    });
    expect(withForeign).toMatchObject({ ok: false, reason: "invalid" });

    const saved = await saveReport(db, owner, reportId, {
      ...base,
      revision: 1,
      content: {
        schemaVersion: 1,
        blocks: [{ id: "blk_img000000001", type: "image", mediaId: asset.id, alt: "Grün" }],
      },
    });
    expect(saved.ok).toBe(true);
    expect(await listMediaUsage(db, owner, asset.id)).toEqual([{ id: reportId, title: "Mit Bild" }]);
    await expect(moveMediaToTrash(db, owner, asset.id)).rejects.toThrow(MediaInUseError);

    // Nach Entfernen aus dem Report: löschen und wiederherstellen
    const cleared = await saveReport(db, owner, reportId, {
      ...base,
      revision: 2,
      content: { schemaVersion: 1, blocks: [] },
    });
    expect(cleared.ok).toBe(true);
    await moveMediaToTrash(db, owner, asset.id);
    expect((await listMedia(db, owner)).map((a) => a.id)).not.toContain(asset.id);
    expect((await listMedia(db, owner, { trash: true })).map((a) => a.id)).toContain(asset.id);
    await restoreMedia(db, owner, asset.id);
    expect((await listMedia(db, owner)).map((a) => a.id)).toContain(asset.id);
  });
});

describe("Bilder im Portfolio", () => {
  it("friert Bilder bei der Freigabe ein; der Viewer sieht nur eingefrorene Kopien im Link-Umfang", async () => {
    const { asset } = await uploadMedia(db, storage, owner, {
      bytes: await pngWithExif("#123456"),
      filename: "alert.png",
      altText: "Alert-Übersicht",
    });
    const { id: reportId } = await createReport(db, owner, { typeKey: "case-analysis" });
    const saved = await saveReport(db, owner, reportId, {
      title: "Fall mit Screenshot",
      structuredFields: {},
      classification: "publishable",
      aiAllowed: false,
      revision: 1,
      content: {
        schemaVersion: 1,
        blocks: [{ id: "blk_img000000002", type: "image", mediaId: asset.id, alt: "", caption: "Alert" }],
      },
    });
    expect(saved.ok).toBe(true);

    const page = await createPageFromReport(db, owner, reportId);
    const draft = await getPage(db, owner, page.id);
    const gallery = draft.config.components.find((c) => c.type === "gallery");
    expect(gallery).toMatchObject({
      items: [{ mediaId: asset.id, alt: "", caption: "Alert" }],
      sourceBlockIds: ["blk_img000000002"],
    });

    // Ohne Bildbeschreibung keine Freigabe.
    await expect(publishPage(db, owner, page.id)).rejects.toThrow(PublishBlockedError);

    const withAlt = {
      schemaVersion: 1,
      components: draft.config.components.map((c) =>
        c.type === "gallery" ? { ...c, items: c.items.map((i) => ({ ...i, alt: "Alert-Übersicht" })) } : c,
      ),
    };
    const result = await savePage(db, owner, page.id, {
      title: draft.title,
      slug: draft.slug,
      locale: "de",
      config: withAlt,
    });
    expect(result.ok).toBe(true);
    await publishPage(db, owner, page.id);
    await addToShowcase(db, owner, page.id);

    const { token } = await createShareLink(db, owner, { scopeType: "showcase", label: "Test", expiresInDays: null });
    const link = (await resolveShareToken(db, token))!;
    const viewerPage = (await getViewerPage(db, link, draft.slug))!;
    const frozen = viewerPage.snapshot.page.components.find((c) => c.type === "gallery");
    expect(frozen?.type).toBe("gallery");
    const frozenId = frozen?.type === "gallery" ? frozen.items[0].mediaId : "";
    // Die Mediathek-ID verlässt den Workspace nicht.
    expect(frozenId).not.toBe(asset.id);
    expect(JSON.stringify(viewerPage.snapshot)).not.toContain(asset.id);

    expect(await getViewerMedia(db, link, frozenId)).toMatchObject({ mimeType: "image/png" });
    expect(await getViewerMedia(db, link, asset.id)).toBeNull();

    // Fremder Link sieht das Bild nicht.
    const { token: otherToken } = await createShareLink(db, other, {
      scopeType: "showcase",
      label: "x",
      expiresInDays: null,
    });
    expect(await getViewerMedia(db, (await resolveShareToken(db, otherToken))!, frozenId)).toBeNull();

    // Neue Freigabe → alte eingefrorene Kopie ist nicht mehr erreichbar.
    await publishPage(db, owner, page.id);
    expect(await getViewerMedia(db, link, frozenId)).toBeNull();
  });

  it("blockiert die Freigabe, wenn ein Bild nicht mehr in der Mediathek ist", async () => {
    const { asset } = await uploadMedia(db, storage, owner, {
      bytes: await pngWithExif("#654321"),
      filename: "weg.png",
    });
    const { id: reportId } = await createReport(db, owner, { typeKey: "case-analysis" });
    await saveReport(db, owner, reportId, {
      title: "Bild wird gelöscht",
      structuredFields: {},
      classification: "publishable",
      aiAllowed: false,
      revision: 1,
      content: { schemaVersion: 1, blocks: [] },
    });
    const page = await createPageFromReport(db, owner, reportId);
    const draft = await getPage(db, owner, page.id);
    const config = {
      schemaVersion: 1,
      components: [
        ...draft.config.components,
        {
          id: "cmp_gallery00001",
          type: "gallery",
          heading: "Bilder",
          items: [{ mediaId: asset.id, alt: "x", caption: "" }],
        },
      ],
    };
    expect(
      (await savePage(db, owner, page.id, { title: draft.title, slug: draft.slug, locale: "de", config })).ok,
    ).toBe(true);
    await moveMediaToTrash(db, owner, asset.id);
    await expect(publishPage(db, owner, page.id)).rejects.toThrow(/nicht mehr in der Mediathek/);
  });
});
