import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import type { Actor } from "@/modules/auth/policy";
import { addLink } from "@/modules/links/service";
import {
  addToShowcase,
  createPageFromReport,
  getPage,
  previewRelated,
  publishPage,
  refreshFullReport,
  type CaseStudySnapshot,
} from "@/modules/portfolio/service";
import { createReport, getReport, saveReport } from "@/modules/reports/service";
import { getOwnerPublishedMedia } from "@/modules/sharing/service";

/** Präsentationsschicht: vollständige Berichte, Verknüpfungen im Snapshot, Vorschau-Daten. */
const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const owner: Actor = { type: "user", userId: "user_presentation_owner", role: "owner" };
const other: Actor = { type: "user", userId: "user_presentation_other", role: "owner" };

beforeAll(async () => {
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: owner.userId, name: "Presenter", email: "presentation-owner@example.test" },
    { id: other.userId, name: "Other", email: "presentation-other@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
});

describe("Vollständiger Bericht", () => {
  it("legt eine Seite mit dem kompletten Report an", async () => {
    const id = await reportWithoutAttachment("Plattform-Projekt");
    const { id: pageId } = await createPageFromReport(db, owner, id, "full");
    const page = await getPage(db, owner, pageId);
    expect(page.config.components.map((c) => c.type)).toEqual(["hero", "fullReport"]);
    const full = page.config.components.find((c) => c.type === "fullReport");
    if (full?.type !== "fullReport") throw new Error();
    expect(full.typeName).toBe("Projektbericht");
    expect(full.sections.map((s) => s.title).length).toBeGreaterThanOrEqual(2);
    expect(full.facts).toEqual(expect.arrayContaining([{ label: "Deine Rolle", value: "Entwicklung" }]));
    expect(full.blocks.some((b) => b.type === "code")).toBe(true);
  });

  it("ergänzt eine bestehende Fallstudie um den Bericht und aktualisiert ihn aus dem Report", async () => {
    const id = await reportWithoutAttachment("Bestehende Seite");
    const { id: pageId } = await createPageFromReport(db, owner, id);
    expect((await getPage(db, owner, pageId)).config.components.some((c) => c.type === "fullReport")).toBe(false);

    const again = await createPageFromReport(db, owner, id, "full");
    expect(again).toEqual({ id: pageId, created: false });
    const page = await getPage(db, owner, pageId);
    expect(page.config.components[1].type).toBe("fullReport");

    const current = await getReport(db, owner, id);
    await saveReport(db, owner, id, {
      title: current.title,
      structuredFields: { ...(current.structuredFields as Record<string, unknown>), result: "Neues Ergebnis." },
      content: current.content,
      classification: current.classification,
      aiAllowed: false,
      revision: current.revision,
    });
    await refreshFullReport(db, owner, pageId);
    const refreshed = (await getPage(db, owner, pageId)).config.components.find((c) => c.type === "fullReport");
    if (refreshed?.type !== "fullReport") throw new Error();
    expect(refreshed.id).toBe(page.config.components[1].id);
    expect(refreshed.sections.some((s) => s.text === "Neues Ergebnis.")).toBe(true);

    await expect(refreshFullReport(db, other, pageId)).rejects.toThrow();
  });
});

describe("Verknüpfte Berichte im Snapshot", () => {
  it("friert Titel und Zielseiten ein und lässt sensible Reports weg", async () => {
    const base = await reportWithoutAttachment("Grundlagen");
    const main = await reportWithoutAttachment("Hauptbericht");
    const secret = await reportWithoutAttachment("Geheimer Folgebericht", "internal_sensitive");
    const privateNext = await reportWithoutAttachment("Privater Folgebericht", "private");
    await addLink(db, owner, base, main);
    await addLink(db, owner, main, secret);
    await addLink(db, owner, main, privateNext);

    const { id: basePage } = await createPageFromReport(db, owner, base);
    const { id: mainPage } = await createPageFromReport(db, owner, main, "full");

    const preview = await previewRelated(db, owner, mainPage);
    expect(preview).toEqual([
      { title: "Grundlagen", relation: "buildsOn", pageId: basePage },
      { title: "Privater Folgebericht", relation: "leadsTo", pageId: null },
    ]);

    await publishPage(db, owner, mainPage);
    await addToShowcase(db, owner, mainPage);
    const snapshot = (await getPage(db, owner, mainPage)).current!.config as CaseStudySnapshot;
    expect(snapshot.related).toEqual(preview);
    expect(JSON.stringify(snapshot)).not.toContain("Geheimer");
  });
});

describe("Eingefrorene Bilder in der Vorschau", () => {
  it("liefert nur eigene eingefrorene Bilder", async () => {
    expect(await getOwnerPublishedMedia(db, owner, "not-a-uuid")).toBeNull();
    expect(await getOwnerPublishedMedia(db, other, "00000000-0000-4000-8000-000000000009")).toBeNull();
  });
});

async function reportWithoutAttachment(
  title: string,
  classification: "private" | "internal_sensitive" | "publishable" = "publishable",
) {
  const { id } = await createReport(db, owner, { typeKey: "project" });
  const current = await getReport(db, owner, id);
  const result = await saveReport(db, owner, id, {
    title,
    structuredFields: {
      occurredOn: "2026-11-01",
      goal: "Synthetisches Ziel.",
      role: "Entwicklung",
      result: "- Läuft stabil\n- Tests grün",
    },
    content: {
      schemaVersion: 1,
      blocks: [{ id: "blk_code00000001", type: "code", language: "typescript", code: "export const a = 1;" }],
    },
    classification,
    aiAllowed: false,
    revision: current.revision,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return id;
}
