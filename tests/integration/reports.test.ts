import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { beforeAll, afterAll, describe, expect, inject, it } from "vitest";
import type { ContentDocument } from "@/content/blocks/schema";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import type { Actor } from "@/modules/auth/policy";
import {
  createReport,
  finalizeReport,
  getReport,
  listReports,
  listVersions,
  moveToTrash,
  ReportNotFoundError,
  restoreFromTrash,
  restoreVersion,
  saveReport,
} from "@/modules/reports/service";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const alice: Actor = { type: "user", userId: "user_reports_alice", role: "owner" };
const mallory: Actor = { type: "user", userId: "user_reports_mallory", role: "owner" };

const doc = (text: string): ContentDocument => ({
  schemaVersion: 1,
  blocks: [
    { id: "blk_heading00001", type: "heading", level: 2, text: "Analyse" },
    {
      id: "blk_code00000001",
      type: "code",
      language: "kusto",
      code: `SecurityEvent | where EventID == 4625 // ${text}`,
    },
  ],
});

const completeFields = {
  occurredOn: "2026-11-18",
  context: "Synthetischer Alert: viele fehlgeschlagene Logins.",
  question: "Brute Force oder Fehlkonfiguration?",
};

function payload(revision: number, overrides: Record<string, unknown> = {}) {
  return {
    title: "Fallanalyse Brute Force",
    structuredFields: completeFields,
    content: doc("v1"),
    classification: "private",
    aiAllowed: false,
    revision,
    ...overrides,
  };
}

beforeAll(async () => {
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: alice.userId, name: "Alice", email: "alice-reports@example.test" },
    { id: mallory.userId, name: "Mallory", email: "mallory-reports@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
});

describe("Reports anlegen und speichern", () => {
  it("legt einen Entwurf an und speichert mit Revisionsprüfung", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    const created = await getReport(db, alice, id);
    expect(created.status).toBe("draft");
    expect(created.revision).toBe(1);
    expect(created.title).toBe("Fallanalyse – Entwurf");

    const saved = await saveReport(db, alice, id, payload(1));
    expect(saved).toMatchObject({ ok: true, revision: 2, status: "draft" });

    const loaded = await getReport(db, alice, id);
    expect(loaded.content).toEqual(doc("v1"));
    expect(loaded.occurredOn).toBe("2026-11-18");
    expect(loaded.plainText).toContain("EventID == 4625");
  });

  it("erkennt Konflikte statt still zu überschreiben", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    expect((await saveReport(db, alice, id, payload(1))).ok).toBe(true);
    // Zweiter Tab speichert noch auf Basis von Revision 1:
    const stale = await saveReport(db, alice, id, payload(1, { title: "Überschreiben?" }));
    expect(stale).toEqual({ ok: false, reason: "conflict", currentRevision: 2 });
    expect((await getReport(db, alice, id)).title).toBe("Fallanalyse Brute Force");
  });

  it("validiert Formularfelder und Blöcke serverseitig", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    const badField = await saveReport(db, alice, id, payload(1, { structuredFields: { severity: "apokalyptisch" } }));
    expect(badField).toMatchObject({ ok: false, reason: "invalid" });
    expect(Object.keys((badField as { fieldErrors: object }).fieldErrors)).toContain("structuredFields.severity");

    const badBlock = await saveReport(
      db,
      alice,
      id,
      payload(1, {
        content: { schemaVersion: 1, blocks: [{ id: "blk_x0000000001", type: "html", html: "<script>" }] },
      }),
    );
    expect(badBlock).toMatchObject({ ok: false, reason: "invalid" });

    const unknownMedia = await saveReport(
      db,
      alice,
      id,
      payload(1, {
        content: {
          schemaVersion: 1,
          blocks: [
            { id: "blk_image0000001", type: "image", mediaId: "6f1c2c1e-6c8b-4f7a-9d2e-0a1b2c3d4e5f", alt: "x" },
          ],
        },
      }),
    );
    expect(unknownMedia).toMatchObject({ ok: false, reason: "invalid" });
    expect((await getReport(db, alice, id)).revision).toBe(1);
  });

  it("sperrt KI-Verarbeitung für sensibel eingestufte Reports serverseitig", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    await saveReport(db, alice, id, payload(1, { classification: "internal_sensitive", aiAllowed: true }));
    const report = await getReport(db, alice, id);
    expect(report.classification).toBe("internal_sensitive");
    expect(report.aiAllowed).toBe(false);
  });
});

describe("Abschließen und Versionen", () => {
  it("schließt nur mit Pflichtfeldern ab und öffnet bei fehlenden Pflichtfeldern wieder", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    const incomplete = await finalizeReport(db, alice, id);
    expect(incomplete.ok).toBe(false);

    await saveReport(db, alice, id, payload(1));
    expect((await finalizeReport(db, alice, id)).ok).toBe(true);
    const final = await getReport(db, alice, id);
    expect(final.status).toBe("final");

    const reopened = await saveReport(
      db,
      alice,
      id,
      payload(final.revision, { structuredFields: { ...completeFields, question: "" } }),
    );
    expect(reopened).toMatchObject({ ok: true, status: "draft", reopened: true });
  });

  it("legt beim ersten Speichern einen Checkpoint an, danach nur bei manuellem Speichern", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    await saveReport(db, alice, id, payload(1));
    await saveReport(db, alice, id, payload(2, { content: doc("v2") }));
    expect((await listVersions(db, alice, id)).map((v) => v.reason)).toEqual(["checkpoint"]);

    await saveReport(db, alice, id, payload(3, { content: doc("v3"), manual: true }));
    expect((await listVersions(db, alice, id)).map((v) => v.reason)).toEqual(["manual", "checkpoint"]);
  });

  it("stellt eine Version wieder her, ohne den aktuellen Stand zu verlieren", async () => {
    const { id } = await createReport(db, alice, { typeKey: "case-analysis" });
    await saveReport(db, alice, id, payload(1)); // v1 = Checkpoint "v1"
    await saveReport(db, alice, id, payload(2, { content: doc("aktuell"), title: "Aktueller Stand" }));
    const [v1] = (await listVersions(db, alice, id)).filter((v) => v.versionNo === 1);

    await restoreVersion(db, alice, id, v1.id);
    const restored = await getReport(db, alice, id);
    expect(restored.content).toEqual(doc("v1"));

    const versions = await listVersions(db, alice, id);
    expect(versions[0].reason).toBe("restore");
    // Der vorherige Stand ("aktuell") ist als Version gesichert.
    expect(versions.some((v) => v.title === "Aktueller Stand" && JSON.stringify(v.content).includes("aktuell"))).toBe(
      true,
    );
  });
});

describe("Zugriffsschutz, Suche und Papierkorb", () => {
  it("behandelt fremde Reports als nicht vorhanden – lesen, speichern, löschen", async () => {
    const { id } = await createReport(db, alice, { typeKey: "learning" });
    await expect(getReport(db, mallory, id)).rejects.toThrow(ReportNotFoundError);
    await expect(saveReport(db, mallory, id, payload(1))).rejects.toThrow(ReportNotFoundError);
    await expect(moveToTrash(db, mallory, id)).rejects.toThrow(ReportNotFoundError);
    await expect(listVersions(db, mallory, id)).rejects.toThrow(ReportNotFoundError);
    expect((await listReports(db, mallory)).map((r) => r.id)).not.toContain(id);
    await expect(getReport(db, alice, "keine-uuid")).rejects.toThrow(ReportNotFoundError);
  });

  it("findet Reports per Volltext und filtert nach Typ/Status", async () => {
    const { id } = await createReport(db, alice, { typeKey: "learning" });
    await saveReport(db, alice, id, {
      title: "Kerberoasting verstehen",
      structuredFields: { topic: "Active Directory" },
      content: doc("Rubeus kerberoast"),
      classification: "private",
      aiAllowed: false,
      revision: 1,
    });
    expect((await listReports(db, alice, { q: "Rubeus" })).map((r) => r.id)).toEqual([id]);
    expect((await listReports(db, alice, { q: "Kerberoasting", type: "case-analysis" })).length).toBe(0);
    expect((await listReports(db, alice, { type: "learning", status: "draft" })).map((r) => r.id)).toContain(id);
  });

  it("verschiebt in den Papierkorb und stellt wieder her", async () => {
    const { id } = await createReport(db, alice, { typeKey: "milestone" });
    await moveToTrash(db, alice, id);
    await expect(getReport(db, alice, id)).rejects.toThrow(ReportNotFoundError);
    expect((await listReports(db, alice)).map((r) => r.id)).not.toContain(id);
    expect((await listReports(db, alice, { trash: true })).map((r) => r.id)).toContain(id);

    await restoreFromTrash(db, alice, id);
    expect((await getReport(db, alice, id)).deletedAt).toBeNull();
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, id));
    expect(audit.map((a) => a.action).sort()).toEqual(["report.created", "report.deleted", "report.restored"]);
  });
});
