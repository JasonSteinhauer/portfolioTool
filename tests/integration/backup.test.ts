import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import { LocalStorage } from "@/lib/storage/local";
import type { Actor } from "@/modules/auth/policy";
import { BACKUP_TABLES, BackupError, createBackup, restoreBackup } from "@/modules/backup/service";
import { uploadMedia } from "@/modules/media/service";
import { addToShowcase, createPageFromReport, publishPage } from "@/modules/portfolio/service";
import { createReport, getReport, listReports, saveReport } from "@/modules/reports/service";
import { createShareLink, getViewerMedia, getViewerPage, resolveShareToken } from "@/modules/sharing/service";

/**
 * Restore-Test: Backup aus der Test-DB → Wiederherstellung in eine ZWEITE, frisch migrierte DB →
 * Inhalte, Suche, Medien und Freigabelinks funktionieren dort identisch.
 */
const sourceClient = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const source = drizzle(sourceClient, { schema });
const adminUrl = new URL(inject("testDatabaseUrl"));
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const targetName = `portfolio_restore_${Date.now()}_${process.pid}`;
const targetUrl = new URL(inject("testDatabaseUrl"));
targetUrl.pathname = `/${targetName}`;
let targetClient: postgres.Sql;
let target: ReturnType<typeof drizzle<typeof schema>>;

let dir: string;
let sourceStorage: LocalStorage;
let targetStorage: LocalStorage;
let backupFile: string;
const PASSPHRASE = "synthetische-test-passphrase-2026";
const owner: Actor = { type: "user", userId: "user_backup_owner", role: "owner" };
let reportId = "";
let token = "";
let slug = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dp-backup-test-"));
  sourceStorage = new LocalStorage(join(dir, "source"));
  targetStorage = new LocalStorage(join(dir, "target"));
  backupFile = join(dir, "out", "backup.dpbak");

  await seedReportTypes(source);
  await source
    .insert(schema.users)
    .values({ id: owner.userId, name: "Backup Owner", email: "backup-owner@example.test" });
  const { asset } = await uploadMedia(source, sourceStorage, owner, {
    bytes: new Uint8Array(
      await sharp({ create: { width: 40, height: 30, channels: 3, background: "#0a7" } })
        .png()
        .toBuffer(),
    ),
    filename: "beweis.png",
    altText: "Synthetischer Beleg",
  });
  ({ id: reportId } = await createReport(source, owner, { typeKey: "case-analysis" }));
  const saved = await saveReport(source, owner, reportId, {
    title: "Wiederherstellbarer Report",
    structuredFields: { question: "Überlebt alles das Backup?" },
    content: {
      schemaVersion: 1,
      blocks: [
        { id: "blk_img000000001", type: "image", mediaId: asset.id, alt: "Synthetischer Beleg" },
        { id: "blk_ins000000001", type: "insight", variant: "finding", title: "Volltextsuche", text: "Quokka-Begriff" },
      ],
    },
    classification: "publishable",
    aiAllowed: false,
    revision: 1,
    manual: true,
  });
  expect(saved.ok).toBe(true);
  const page = await createPageFromReport(source, owner, reportId);
  await publishPage(source, owner, page.id);
  await addToShowcase(source, owner, page.id);
  ({ token } = await createShareLink(source, owner, { scopeType: "showcase", label: "Backup", expiresInDays: null }));
  const [p] = await source
    .select({ slug: schema.portfolioPages.slug })
    .from(schema.portfolioPages)
    .where(eq(schema.portfolioPages.id, page.id));
  slug = p.slug;

  await admin.unsafe(`CREATE DATABASE "${targetName}"`);
  targetClient = postgres(targetUrl.toString(), { max: 2, onnotice: () => {} });
  target = drizzle(targetClient, { schema });
  await migrate(target, { migrationsFolder: "./drizzle" });
  await seedReportTypes(target); // wie `pnpm db:seed` auf einer frischen Produktion
});

afterAll(async () => {
  await sourceClient.end();
  await targetClient?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`);
  await admin.end();
  await rm(dir, { recursive: true, force: true });
});

describe("Backup", () => {
  it("ist verschlüsselt und enthält keine Klartexte", async () => {
    const manifest = await createBackup(source, sourceStorage, { outputFile: backupFile, passphrase: PASSPHRASE });
    expect(manifest.tables.users).toBe(1);
    expect(manifest.tables.reports).toBe(1);
    expect(manifest.media).toBe(1);
    expect(manifest.tables).not.toHaveProperty("sessions");
    const bytes = await readFile(backupFile);
    expect(bytes.subarray(0, 6).toString()).toBe("DPBAK1");
    expect(bytes.includes("backup-owner@example.test")).toBe(false);
    expect(bytes.includes("Wiederherstellbarer")).toBe(false);
  });

  it("verlangt eine lange Passphrase und erkennt falsche Passphrasen und Manipulation", async () => {
    await expect(
      createBackup(source, sourceStorage, { outputFile: join(dir, "x.dpbak"), passphrase: "kurz" }),
    ).rejects.toThrow(BackupError);
    await expect(
      restoreBackup(target, targetStorage, { inputFile: backupFile, passphrase: "falsche-passphrase-1234" }),
    ).rejects.toThrow(/Entschlüsselung fehlgeschlagen/);
    const tampered = join(dir, "tampered.dpbak");
    const bytes = await readFile(backupFile);
    bytes[bytes.length - 40] ^= 0xff;
    await writeFile(tampered, bytes);
    await expect(restoreBackup(target, targetStorage, { inputFile: tampered, passphrase: PASSPHRASE })).rejects.toThrow(
      BackupError,
    );
    // Nichts wurde geschrieben.
    expect((await target.select().from(schema.users)).length).toBe(0);
  });

  it("stellt alles in einer frischen Datenbank wieder her", async () => {
    const manifest = await restoreBackup(target, targetStorage, { inputFile: backupFile, passphrase: PASSPHRASE });
    for (const table of BACKUP_TABLES) {
      const [{ n }] = await target.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
      expect(n, table).toBe(manifest.tables[table]);
    }
    const report = await getReport(target, owner, reportId);
    expect(report.title).toBe("Wiederherstellbarer Report");
    // Generierter Suchindex wurde neu berechnet.
    expect((await listReports(target, owner, { q: "Quokka" })).map((r) => r.id)).toEqual([reportId]);
    // Freigabelink und eingefrorenes Bild funktionieren weiter.
    const link = await resolveShareToken(target, token);
    expect(link).not.toBeNull();
    const page = await getViewerPage(target, link!, slug);
    const gallery = page?.snapshot.page.components.find((c) => c.type === "gallery");
    const frozenId = gallery?.type === "gallery" ? gallery.items[0].mediaId : "";
    const media = await getViewerMedia(target, link!, frozenId);
    expect(media).not.toBeNull();
    const file = await targetStorage.get(media!.storageKey);
    expect(file?.size).toBeGreaterThan(0);
  });

  it("verweigert die Wiederherstellung in eine nicht leere Datenbank", async () => {
    await expect(
      restoreBackup(target, targetStorage, { inputFile: backupFile, passphrase: PASSPHRASE }),
    ).rejects.toThrow(/nicht leer/);
  });
});
