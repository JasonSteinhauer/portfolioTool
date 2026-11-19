import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ContentDocument } from "@/content/blocks/schema";
import { extractPlainText } from "@/content/blocks/utils";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const OWNER = "user_test_owner";

/** Drizzle verpackt DB-Fehler; die Meldung von Postgres steckt in `cause`. */
async function expectDbError(promise: PromiseLike<unknown>, pattern: RegExp) {
  const error = await Promise.resolve(promise).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, "Die Datenbank hätte die Operation ablehnen müssen").toBeInstanceOf(Error);
  const err = error as Error & { cause?: { message?: string } };
  expect(`${err.message} ${err.cause?.message ?? ""}`).toMatch(pattern);
}

const content: ContentDocument = {
  schemaVersion: 1,
  blocks: [
    { id: "blk_heading00001", type: "heading", level: 2, text: "Kerberoasting im Lab" },
    {
      id: "blk_code00000001",
      type: "code",
      language: "powershell",
      code: "Get-ADUser -Filter * -Properties ServicePrincipalName",
    },
  ],
};

async function caseAnalysisTypeId() {
  const [type] = await db.select().from(schema.reportTypes).where(eq(schema.reportTypes.key, "case-analysis"));
  return type.id;
}

beforeAll(async () => {
  await db.insert(schema.users).values({ id: OWNER, name: "Test Owner", email: "owner@example.test" });
});

afterAll(async () => {
  await client.end();
});

describe("Migrationen & Seed", () => {
  it("legt alle Tabellen an", async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of [
      "users",
      "reports",
      "report_versions",
      "media_assets",
      "published_snapshots",
      "share_links",
      "audit_events",
      "ai_proposals",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("Seed ist idempotent", async () => {
    await seedReportTypes(db);
    await seedReportTypes(db);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.reportTypes);
    expect(count).toBe(6);
  });
});

describe("Reports", () => {
  it("speichert das Blockdokument verlustfrei und findet es per Volltextsuche", async () => {
    const [report] = await db
      .insert(schema.reports)
      .values({
        ownerId: OWNER,
        reportTypeId: await caseAnalysisTypeId(),
        title: "Fallanalyse: Kerberoasting",
        content,
        plainText: extractPlainText(content),
        structuredFields: { question: "Wurde ein Service-Account angegriffen?" },
      })
      .returning();

    expect(report.status).toBe("draft");
    expect(report.classification).toBe("private");
    expect(report.aiAllowed).toBe(false); // KI ist standardmäßig aus
    expect(report.revision).toBe(1);

    const [loaded] = await db.select().from(schema.reports).where(eq(schema.reports.id, report.id));
    expect(loaded.content).toEqual(content);

    const hits = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(sql`${schema.reports.searchVector} @@ plainto_tsquery('simple', 'ServicePrincipalName')`);
    expect(hits.map((h) => h.id)).toContain(report.id);
  });

  it("verhindert doppelte Versionsnummern pro Report", async () => {
    const [report] = await db
      .insert(schema.reports)
      .values({ ownerId: OWNER, reportTypeId: await caseAnalysisTypeId(), title: "V", content })
      .returning();
    const version = {
      reportId: report.id,
      versionNo: 1,
      title: "V",
      structuredFields: {},
      content,
      reason: "manual" as const,
    };
    await db.insert(schema.reportVersions).values(version);
    await expectDbError(db.insert(schema.reportVersions).values(version), /report_versions_report_no_uq/);
  });

  it("verweigert Reports ohne existierenden Owner (Fremdschlüssel)", async () => {
    await expectDbError(
      db
        .insert(schema.reports)
        .values({ ownerId: "unknown", reportTypeId: await caseAnalysisTypeId(), title: "x", content }),
      /foreign key/,
    );
  });
});

describe("Medien", () => {
  it("dedupliziert identische Dateien pro Owner über den Hash", async () => {
    const asset = {
      ownerId: OWNER,
      kind: "image" as const,
      sha256: "a".repeat(64),
      storageKey: "private/sha256/aa/aaaa",
    };
    await db.insert(schema.mediaAssets).values(asset);
    await expectDbError(db.insert(schema.mediaAssets).values(asset), /media_assets_owner_sha_uq/);
  });

  it("erlaubt mehrere externe Links ohne Hash", async () => {
    const link = { ownerId: OWNER, kind: "link" as const, url: "https://example.org" };
    await db.insert(schema.mediaAssets).values([link, link]);
    const rows = await db
      .select()
      .from(schema.mediaAssets)
      .where(and(eq(schema.mediaAssets.ownerId, OWNER), eq(schema.mediaAssets.kind, "link")));
    expect(rows.length).toBe(2);
  });
});

describe("Veröffentlichung", () => {
  it("erlaubt pro Seite nur einen aktuellen Snapshot", async () => {
    const [page] = await db
      .insert(schema.portfolioPages)
      .values({ ownerId: OWNER, kind: "case_study", slug: "kerberoasting", title: "Kerberoasting" })
      .returning();
    await db
      .insert(schema.publishedSnapshots)
      .values({ portfolioPageId: page.id, versionNo: 1, config: {}, isCurrent: true });
    await expectDbError(
      db
        .insert(schema.publishedSnapshots)
        .values({ portfolioPageId: page.id, versionNo: 2, config: {}, isCurrent: true }),
      /published_snapshots_one_current_uq/,
    );
  });

  it("erlaubt nur einen Showcase pro Owner", async () => {
    await db
      .insert(schema.collections)
      .values({ ownerId: OWNER, kind: "showcase", name: "Showcase", slug: "showcase" });
    await expectDbError(
      db.insert(schema.collections).values({ ownerId: OWNER, kind: "showcase", name: "Zweiter", slug: "showcase-2" }),
      /collections_one_showcase_uq/,
    );
  });
});

describe("Audit-Log", () => {
  it("ist append-only: UPDATE, DELETE und TRUNCATE werden von der DB abgelehnt", async () => {
    const [event] = await db
      .insert(schema.auditEvents)
      .values({ actorType: "system", action: "test.event", metadata: { ok: true } })
      .returning();

    await expectDbError(
      db.update(schema.auditEvents).set({ action: "manipuliert" }).where(eq(schema.auditEvents.id, event.id)),
      /append-only/,
    );
    await expectDbError(db.delete(schema.auditEvents).where(eq(schema.auditEvents.id, event.id)), /append-only/);
    await expectDbError(db.execute(sql`truncate audit_events`), /append-only/);

    const [still] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.id, event.id));
    expect(still.action).toBe("test.event");
  });
});
