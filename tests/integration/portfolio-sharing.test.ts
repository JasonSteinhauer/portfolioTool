import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import type { Actor } from "@/modules/auth/policy";
import {
  addToShowcase,
  createPageFromReport,
  getPage,
  listShowcase,
  moveInShowcase,
  PageNotFoundError,
  publishPage,
  publishProfile,
  PublishBlockedError,
  savePage,
  saveProfile,
  toggleFavorite,
  unpublishPage,
} from "@/modules/portfolio/service";
import { createReport, saveReport } from "@/modules/reports/service";
import {
  createShareLink,
  getViewerHome,
  getViewerPage,
  hashToken,
  resolveShareToken,
  revokeShareLink,
} from "@/modules/sharing/service";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const owner: Actor = { type: "user", userId: "user_portfolio_owner", role: "owner" };
const other: Actor = { type: "user", userId: "user_portfolio_other", role: "owner" };

async function reportWith(
  title: string,
  classification: "private" | "internal_sensitive" | "publishable" = "publishable",
) {
  const { id } = await createReport(db, owner, { typeKey: "case-analysis" });
  const result = await saveReport(db, owner, id, {
    title,
    structuredFields: {
      occurredOn: "2026-11-18",
      context: "Synthetische Ausgangslage.",
      question: "Was ist passiert?",
      conclusion: "Fehlkonfiguration.",
    },
    content: {
      schemaVersion: 1,
      blocks: [
        { id: "blk_code00000001", type: "code", language: "kusto", code: "SigninLogs | take 10" },
        { id: "blk_insight00001", type: "insight", variant: "finding", title: "MFA fehlte", text: "" },
      ],
    },
    classification,
    aiAllowed: false,
    revision: 1,
  });
  expect(result.ok).toBe(true);
  return id;
}

beforeAll(async () => {
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: owner.userId, name: "Portfolio Owner", email: "portfolio-owner@example.test" },
    { id: other.userId, name: "Other", email: "portfolio-other@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
});

describe("Seitenentwurf aus Report", () => {
  it("übernimmt nur vorhandene Inhalte und verweist auf Quellblöcke", async () => {
    const reportId = await reportWith("Fallstudie A");
    const { id, created } = await createPageFromReport(db, owner, reportId);
    expect(created).toBe(true);
    const page = await getPage(db, owner, id);
    const types = page.config.components.map((c) => c.type);
    expect(types).toEqual(["hero", "projectOverview", "codeShowcase", "insights", "resultHighlights"]);
    expect(page.config.components.find((c) => c.type === "codeShowcase")?.sourceBlockIds).toEqual(["blk_code00000001"]);
    expect(page.slug).toBe("fallstudie-a");

    // Zweiter Aufruf liefert dieselbe Seite statt eines Duplikats.
    expect(await createPageFromReport(db, owner, reportId)).toEqual({ id, created: false });
  });

  it("fremde Reports und Seiten sind nicht erreichbar", async () => {
    const reportId = await reportWith("Fallstudie Fremd");
    await expect(createPageFromReport(db, other, reportId)).rejects.toThrow();
    const { id } = await createPageFromReport(db, owner, reportId);
    await expect(getPage(db, other, id)).rejects.toThrow(PageNotFoundError);
    await expect(publishPage(db, other, id)).rejects.toThrow(PageNotFoundError);
    await expect(toggleFavorite(db, other, "page", id)).rejects.toThrow(PageNotFoundError);
  });
});

describe("Freigabe", () => {
  it("friert den Stand ein – spätere Änderungen ändern die freigegebene Seite nicht", async () => {
    const reportId = await reportWith("Fallstudie B");
    const { id } = await createPageFromReport(db, owner, reportId);
    const snapshot = await publishPage(db, owner, id);
    expect(snapshot.versionNo).toBe(1);

    const page = await getPage(db, owner, id);
    const edited = page.config.components.map((c) => (c.type === "hero" ? { ...c, title: "Geänderter Entwurf" } : c));
    expect(
      (
        await savePage(db, owner, id, {
          title: page.title,
          slug: page.slug,
          locale: "de",
          config: { ...page.config, components: edited },
        })
      ).ok,
    ).toBe(true);

    const link = await createShareLink(db, owner, {
      scopeType: "page",
      scopeId: id,
      label: "Test",
      expiresInDays: null,
    });
    const resolved = await resolveShareToken(db, link.token);
    const viewed = await getViewerPage(db, resolved!, page.slug);
    const hero = viewed!.snapshot.page.components.find((c) => c.type === "hero");
    expect(hero && hero.type === "hero" ? hero.title : "").toBe("Fallstudie B");
    // Snapshots enthalten keine Verweise in den privaten Report.
    expect(JSON.stringify(viewed!.snapshot)).not.toContain("blk_");

    const second = await publishPage(db, owner, id);
    expect(second.versionNo).toBe(2);
    const again = await getViewerPage(db, resolved!, page.slug);
    const hero2 = again!.snapshot.page.components.find((c) => c.type === "hero");
    expect(hero2 && hero2.type === "hero" ? hero2.title : "").toBe("Geänderter Entwurf");
  });

  it("verweigert die Freigabe von Seiten aus sensibel eingestuften Reports", async () => {
    const reportId = await reportWith("Interner Vorfall", "internal_sensitive");
    const { id } = await createPageFromReport(db, owner, reportId);
    await expect(publishPage(db, owner, id)).rejects.toThrow(PublishBlockedError);
    const snapshots = await db
      .select()
      .from(schema.publishedSnapshots)
      .where(eq(schema.publishedSnapshots.portfolioPageId, id));
    expect(snapshots).toHaveLength(0);
  });

  it("zurückziehen macht die Seite sofort unsichtbar", async () => {
    const reportId = await reportWith("Fallstudie C");
    const { id } = await createPageFromReport(db, owner, reportId);
    await publishPage(db, owner, id);
    const link = await createShareLink(db, owner, { scopeType: "page", scopeId: id, label: "C", expiresInDays: 7 });
    const resolved = (await resolveShareToken(db, link.token))!;
    expect(await getViewerPage(db, resolved, "fallstudie-c")).not.toBeNull();
    await unpublishPage(db, owner, id);
    expect(await getViewerPage(db, resolved, "fallstudie-c")).toBeNull();
  });
});

describe("Showcase, Profil und Freigabelinks", () => {
  it("zeigt nur freigegebene Seiten des Showcase in der gewählten Reihenfolge", async () => {
    const first = (await createPageFromReport(db, owner, await reportWith("Showcase Eins"))).id;
    const second = (await createPageFromReport(db, owner, await reportWith("Showcase Zwei"))).id;
    const unpublished = (await createPageFromReport(db, owner, await reportWith("Nicht freigegeben"))).id;
    await publishPage(db, owner, first);
    await publishPage(db, owner, second);
    for (const id of [first, second, unpublished]) await addToShowcase(db, owner, id);
    await moveInShowcase(db, owner, second, -1);
    expect((await listShowcase(db, owner)).map((i) => i.pageId)).toEqual([second, first, unpublished]);

    await saveProfile(db, owner, {
      schemaVersion: 1,
      name: "Portfolio Owner",
      role: "Dualer Student Informatik",
      about: "Synthetisches Profil.",
      expertise: [{ area: "Security Operations", detail: "Alert-Triage" }],
      contact: { email: "portfolio-owner@example.test", links: [] },
    });
    await publishProfile(db, owner);

    const link = await createShareLink(db, owner, { scopeType: "showcase", label: "Bewerbung", expiresInDays: 30 });
    const resolved = (await resolveShareToken(db, link.token, { countAccess: true }))!;
    const home = await getViewerHome(db, resolved);
    expect(home.profile?.role).toBe("Dualer Student Informatik");
    expect(home.pages.map((p) => p.pageId)).toEqual([second, first]);
    expect(await getViewerPage(db, resolved, "nicht-freigegeben")).toBeNull();
  });

  it("ein Seiten-Link gibt keine anderen Seiten und kein Profil frei", async () => {
    const a = (await createPageFromReport(db, owner, await reportWith("Nur diese"))).id;
    const b = (await createPageFromReport(db, owner, await reportWith("Nicht diese"))).id;
    await publishPage(db, owner, a);
    await publishPage(db, owner, b);
    const link = await createShareLink(db, owner, {
      scopeType: "page",
      scopeId: a,
      label: "Einzeln",
      expiresInDays: null,
    });
    const resolved = (await resolveShareToken(db, link.token))!;
    const home = await getViewerHome(db, resolved);
    expect(home.profile).toBeNull();
    expect(home.pages.map((p) => p.slug)).toEqual(["nur-diese"]);
    expect(await getViewerPage(db, resolved, "nicht-diese")).toBeNull();
  });

  it("speichert nur den Hash, widerruft sofort und respektiert den Ablauf", async () => {
    const link = await createShareLink(db, owner, { scopeType: "showcase", label: "Widerruf", expiresInDays: 1 });
    const [row] = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.id, link.id));
    expect(row.tokenHash).toBe(hashToken(link.token));
    expect(JSON.stringify(row)).not.toContain(link.token);

    expect(await resolveShareToken(db, link.token)).not.toBeNull();
    await revokeShareLink(db, other, link.id).catch(() => undefined); // fremder Owner darf nicht widerrufen
    expect(await resolveShareToken(db, link.token)).not.toBeNull();
    await revokeShareLink(db, owner, link.id);
    expect(await resolveShareToken(db, link.token)).toBeNull();

    const expiring = await createShareLink(db, owner, { scopeType: "showcase", label: "Ablauf", expiresInDays: 1 });
    await db
      .update(schema.shareLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.shareLinks.id, expiring.id));
    expect(await resolveShareToken(db, expiring.token)).toBeNull();

    expect(await resolveShareToken(db, "zu-kurz")).toBeNull();
    expect(await resolveShareToken(db, "A".repeat(43))).toBeNull();
  });
});
