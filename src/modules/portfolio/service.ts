import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { pageConfigFromReport } from "@/content/page-components/from-report";
import {
  PAGE_SCHEMA_VERSION,
  pageConfigSchema,
  profileConfigSchema,
  type PageConfig,
  type ProfileConfig,
} from "@/content/page-components/schema";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { getReport } from "@/modules/reports/service";

/**
 * Portfolio-Seiten, Freigabe (Snapshots), Showcase und Favoriten.
 *
 * Grundsatz: Viewer sehen nie den Arbeitsstand (`draft_config`) und nie den Report,
 * sondern nur den eingefrorenen Snapshot zum Zeitpunkt der Freigabe.
 */

type Db = PostgresJsDatabase<typeof schema>;

export class PageNotFoundError extends Error {
  constructor() {
    super("Seite nicht gefunden");
    this.name = "PageNotFoundError";
  }
}

export class PublishBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishBlockedError";
  }
}

/** Was im Snapshot einer Fallstudie steht – ohne Quellverweise in den Report. */
export type CaseStudySnapshot = {
  kind: "case_study";
  title: string;
  slug: string;
  locale: "de" | "en";
  page: PageConfig;
};
export type ProfileSnapshot = { kind: "profile"; profile: ProfileConfig };

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  // Mindestens 3 Zeichen (SLUG_PATTERN); sehr kurze Titel bekommen ein Präfix.
  if (slug.length >= 3) return slug;
  return slug ? `seite-${slug}` : "seite";
}

async function uniqueSlug(db: Db, ownerId: string, base: string, exceptId?: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [clash] = await db
      .select({ id: schema.portfolioPages.id })
      .from(schema.portfolioPages)
      .where(and(eq(schema.portfolioPages.ownerId, ownerId), eq(schema.portfolioPages.slug, slug)));
    if (!clash || clash.id === exceptId) return slug;
    slug = `${base}-${i}`;
  }
  throw new Error("Kein freier Slug gefunden");
}

function stripSources(config: PageConfig): PageConfig {
  return {
    schemaVersion: config.schemaVersion,
    components: config.components.map((c) => {
      const copy = { ...c };
      delete copy.sourceBlockIds;
      return copy;
    }),
  };
}

// ---------------------------------------------------------------------------
// Seiten
// ---------------------------------------------------------------------------

export async function listPages(db: Db, actor: Actor) {
  assertCan(actor, "portfolio_page:read");
  const pages = await db
    .select({
      id: schema.portfolioPages.id,
      title: schema.portfolioPages.title,
      slug: schema.portfolioPages.slug,
      updatedAt: schema.portfolioPages.updatedAt,
      sourceReportId: schema.portfolioPages.sourceReportId,
      publishedVersion: schema.publishedSnapshots.versionNo,
      publishedAt: schema.publishedSnapshots.approvedAt,
    })
    .from(schema.portfolioPages)
    .leftJoin(
      schema.publishedSnapshots,
      and(
        eq(schema.publishedSnapshots.portfolioPageId, schema.portfolioPages.id),
        eq(schema.publishedSnapshots.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(schema.portfolioPages.ownerId, actor.userId),
        eq(schema.portfolioPages.kind, "case_study"),
        isNull(schema.portfolioPages.deletedAt),
      ),
    )
    .orderBy(desc(schema.portfolioPages.updatedAt));

  const favorites = await listFavoriteIds(db, actor, "page");
  const showcase = await listShowcase(db, actor);
  const inShowcase = new Set(showcase.map((s) => s.pageId));
  return pages.map((p) => ({ ...p, favorite: favorites.has(p.id), inShowcase: inShowcase.has(p.id) }));
}

export async function getPage(db: Db, actor: Actor, pageId: string) {
  if (!z.uuid().safeParse(pageId).success) throw new PageNotFoundError();
  const [page] = await db
    .select()
    .from(schema.portfolioPages)
    .where(and(eq(schema.portfolioPages.id, pageId), isNull(schema.portfolioPages.deletedAt)));
  if (!page || page.kind !== "case_study") throw new PageNotFoundError();
  try {
    assertCan(actor, "portfolio_page:read", { ownerId: page.ownerId });
  } catch {
    throw new PageNotFoundError();
  }
  const [current] = await db
    .select()
    .from(schema.publishedSnapshots)
    .where(and(eq(schema.publishedSnapshots.portfolioPageId, pageId), eq(schema.publishedSnapshots.isCurrent, true)));
  return { ...page, config: pageConfigSchema.parse(page.draftConfig), current: current ?? null };
}

/** Legt (einmal pro Report) einen Seitenentwurf aus dem Report an. */
export async function createPageFromReport(
  db: Db,
  actor: Actor,
  reportId: string,
): Promise<{ id: string; created: boolean }> {
  assertCan(actor, "portfolio_page:create");
  const report = await getReport(db, actor, reportId);

  const [existing] = await db
    .select({ id: schema.portfolioPages.id })
    .from(schema.portfolioPages)
    .where(
      and(
        eq(schema.portfolioPages.sourceReportId, reportId),
        eq(schema.portfolioPages.ownerId, actor.userId),
        isNull(schema.portfolioPages.deletedAt),
      ),
    );
  if (existing) return { id: existing.id, created: false };

  const config = pageConfigFromReport({
    title: report.title,
    typeName: report.type.name,
    structuredFields: report.structuredFields,
    fieldSchema: report.type.fieldSchema,
    content: report.content,
  });
  const slug = await uniqueSlug(db, actor.userId, slugify(report.title));
  const [page] = await db
    .insert(schema.portfolioPages)
    .values({
      ownerId: actor.userId,
      kind: "case_study",
      sourceReportId: reportId,
      slug,
      title: report.title.slice(0, 200),
      draftConfig: config,
    })
    .returning({ id: schema.portfolioPages.id });
  return { id: page.id, created: true };
}

export const savePageSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(200),
  slug: z.string().trim().regex(SLUG_PATTERN, "Nur Kleinbuchstaben, Ziffern und Bindestriche (3–80 Zeichen)"),
  locale: z.enum(["de", "en"]),
  config: pageConfigSchema,
});

export type SavePageResult = { ok: true } | { ok: false; fieldErrors: Record<string, string> };

export async function savePage(db: Db, actor: Actor, pageId: string, input: unknown): Promise<SavePageResult> {
  const page = await getPage(db, actor, pageId);
  assertCan(actor, "portfolio_page:update", { ownerId: page.ownerId });
  const parsed = savePageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const slug = await uniqueSlug(db, actor.userId, parsed.data.slug, pageId);
  if (slug !== parsed.data.slug) return { ok: false, fieldErrors: { slug: "Diese Adresse ist schon vergeben" } };

  await db
    .update(schema.portfolioPages)
    .set({
      title: parsed.data.title,
      slug,
      locale: parsed.data.locale,
      draftConfig: parsed.data.config,
      updatedAt: new Date(),
    })
    .where(eq(schema.portfolioPages.id, pageId));
  return { ok: true };
}

type FrozenMedia = {
  id: string;
  sourceMediaAssetId: string;
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string;
};

async function createSnapshot(
  db: Db,
  pageId: string,
  config: CaseStudySnapshot | ProfileSnapshot,
  sourceReportId: string | null,
  media: FrozenMedia[] = [],
) {
  return db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.publishedSnapshots.versionNo}), 0)::int` })
      .from(schema.publishedSnapshots)
      .where(eq(schema.publishedSnapshots.portfolioPageId, pageId));

    let sourceReportVersionId: string | null = null;
    if (sourceReportId) {
      const [version] = await tx
        .select({ id: schema.reportVersions.id })
        .from(schema.reportVersions)
        .where(eq(schema.reportVersions.reportId, sourceReportId))
        .orderBy(desc(schema.reportVersions.versionNo))
        .limit(1);
      sourceReportVersionId = version?.id ?? null;
    }

    await tx
      .update(schema.publishedSnapshots)
      .set({ isCurrent: false })
      .where(eq(schema.publishedSnapshots.portfolioPageId, pageId));
    const [snapshot] = await tx
      .insert(schema.publishedSnapshots)
      .values({ portfolioPageId: pageId, versionNo: max + 1, config, sourceReportVersionId, isCurrent: true })
      .returning({ id: schema.publishedSnapshots.id, versionNo: schema.publishedSnapshots.versionNo });
    if (media.length > 0) {
      await tx.insert(schema.publishedMedia).values(media.map((m) => ({ ...m, snapshotId: snapshot.id })));
    }
    return snapshot;
  });
}

/**
 * Friert die Bilder einer Seite ein: jedes Bild bekommt eine eigene `published_media`-Zeile mit
 * neuer ID. Der Snapshot verweist nur noch auf diese IDs – Mediathek-IDs verlassen den Workspace nie,
 * und späteres Löschen/Ersetzen in der Mediathek ändert die freigegebene Seite nicht.
 */
async function freezeMedia(
  db: Db,
  actor: Actor,
  config: PageConfig,
): Promise<{ config: PageConfig; media: FrozenMedia[] }> {
  const items = config.components.flatMap((c) => (c.type === "gallery" ? c.items : []));
  if (items.length === 0) return { config, media: [] };
  if (items.some((item) => item.alt.trim() === "")) {
    throw new PublishBlockedError(
      "Jedes Bild braucht eine Bildbeschreibung (Alt-Text), bevor die Seite freigegeben wird.",
    );
  }
  const ids = [...new Set(items.map((item) => item.mediaId))];
  const assets = await db
    .select({
      id: schema.mediaAssets.id,
      storageKey: schema.mediaAssets.storageKey,
      mimeType: schema.mediaAssets.mimeType,
      width: schema.mediaAssets.width,
      height: schema.mediaAssets.height,
      altText: schema.mediaAssets.altText,
    })
    .from(schema.mediaAssets)
    .where(
      and(
        inArray(schema.mediaAssets.id, ids),
        eq(schema.mediaAssets.ownerId, actor.userId),
        eq(schema.mediaAssets.kind, "image"),
        isNull(schema.mediaAssets.deletedAt),
      ),
    );
  if (assets.length !== ids.length) {
    throw new PublishBlockedError("Ein Bild der Seite ist nicht mehr in der Mediathek. Bitte entfernen oder ersetzen.");
  }
  const frozen = new Map(
    assets.map((a) => [
      a.id,
      {
        id: randomUUID(),
        sourceMediaAssetId: a.id,
        storageKey: a.storageKey!,
        mimeType: a.mimeType!,
        width: a.width,
        height: a.height,
        altText: a.altText ?? "",
      },
    ]),
  );
  return {
    config: {
      ...config,
      components: config.components.map((c) =>
        c.type === "gallery"
          ? { ...c, items: c.items.map((item) => ({ ...item, mediaId: frozen.get(item.mediaId)!.id })) }
          : c,
      ),
    },
    media: [...frozen.values()],
  };
}

/**
 * Gibt den aktuellen Entwurf frei: friert ihn als neue Snapshot-Version ein.
 * Spätere Änderungen an Entwurf oder Report ändern die freigegebene Seite NICHT.
 */
export async function publishPage(db: Db, actor: Actor, pageId: string) {
  const page = await getPage(db, actor, pageId);
  assertCan(actor, "portfolio_page:publish", { ownerId: page.ownerId });

  if (page.sourceReportId) {
    const [source] = await db
      .select({ classification: schema.reports.classification })
      .from(schema.reports)
      .where(eq(schema.reports.id, page.sourceReportId));
    if (source?.classification === "internal_sensitive") {
      throw new PublishBlockedError(
        "Der Quell-Report ist als „intern/sensibel“ eingestuft und kann nicht veröffentlicht werden.",
      );
    }
  }
  if (!page.config.components.some((c) => c.type === "hero")) {
    throw new PublishBlockedError("Die Seite braucht einen Hero-Abschnitt mit Titel.");
  }

  const { config, media } = await freezeMedia(db, actor, stripSources(page.config));
  const snapshot = await createSnapshot(
    db,
    pageId,
    { kind: "case_study", title: page.title, slug: page.slug, locale: page.locale, page: config },
    page.sourceReportId,
    media,
  );
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "page.published",
    targetType: "portfolio_page",
    targetId: pageId,
    metadata: { version: snapshot.versionNo },
  });
  return snapshot;
}

export async function unpublishPage(db: Db, actor: Actor, pageId: string) {
  const page = await getPage(db, actor, pageId);
  assertCan(actor, "portfolio_page:publish", { ownerId: page.ownerId });
  await db
    .update(schema.publishedSnapshots)
    .set({ isCurrent: false })
    .where(eq(schema.publishedSnapshots.portfolioPageId, pageId));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "page.unpublished",
    targetType: "portfolio_page",
    targetId: pageId,
  });
}

// ---------------------------------------------------------------------------
// Profil (Über mich, Expertise, Kontakt)
// ---------------------------------------------------------------------------

export function defaultProfile(name: string): ProfileConfig {
  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    name,
    role: "",
    about: "",
    expertise: [],
    contact: { email: "", links: [] },
  };
}

async function profilePage(db: Db, actor: Actor, name: string) {
  const [page] = await db
    .select()
    .from(schema.portfolioPages)
    .where(
      and(
        eq(schema.portfolioPages.ownerId, actor.userId),
        eq(schema.portfolioPages.kind, "profile"),
        isNull(schema.portfolioPages.deletedAt),
      ),
    );
  if (page) return page;
  const [created] = await db
    .insert(schema.portfolioPages)
    .values({
      ownerId: actor.userId,
      kind: "profile",
      slug: "profil",
      title: "Profil",
      draftConfig: defaultProfile(name),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(schema.portfolioPages)
    .where(and(eq(schema.portfolioPages.ownerId, actor.userId), eq(schema.portfolioPages.kind, "profile")));
  return again;
}

export async function getProfile(db: Db, actor: Actor, fallbackName: string) {
  assertCan(actor, "portfolio_page:read");
  const page = await profilePage(db, actor, fallbackName);
  const [current] = await db
    .select()
    .from(schema.publishedSnapshots)
    .where(and(eq(schema.publishedSnapshots.portfolioPageId, page.id), eq(schema.publishedSnapshots.isCurrent, true)));
  return { id: page.id, profile: profileConfigSchema.parse(page.draftConfig), current: current ?? null };
}

export async function saveProfile(db: Db, actor: Actor, input: unknown): Promise<SavePageResult> {
  assertCan(actor, "portfolio_page:update");
  const parsed = profileConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const page = await profilePage(db, actor, parsed.data.name);
  await db
    .update(schema.portfolioPages)
    .set({ draftConfig: parsed.data, updatedAt: new Date() })
    .where(eq(schema.portfolioPages.id, page.id));
  return { ok: true };
}

export async function publishProfile(db: Db, actor: Actor) {
  assertCan(actor, "portfolio_page:publish");
  const page = await profilePage(db, actor, "");
  const profile = profileConfigSchema.parse(page.draftConfig);
  const snapshot = await createSnapshot(db, page.id, { kind: "profile", profile }, null);
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "page.published",
    targetType: "portfolio_page",
    targetId: page.id,
    metadata: { version: snapshot.versionNo, kind: "profile" },
  });
  return snapshot;
}

// ---------------------------------------------------------------------------
// Showcase (kuratierte, sortierte Auswahl)
// ---------------------------------------------------------------------------

async function ensureShowcase(db: Db, actor: Actor): Promise<string> {
  const [existing] = await db
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(and(eq(schema.collections.ownerId, actor.userId), eq(schema.collections.kind, "showcase")));
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.collections)
    .values({ ownerId: actor.userId, kind: "showcase", name: "Showcase", slug: "showcase" })
    .onConflictDoNothing()
    .returning({ id: schema.collections.id });
  return created?.id ?? (await ensureShowcase(db, actor));
}

export async function listShowcase(db: Db, actor: Actor) {
  assertCan(actor, "collection:read");
  const showcaseId = await ensureShowcase(db, actor);
  return db
    .select({
      pageId: schema.collectionItems.portfolioPageId,
      position: schema.collectionItems.position,
      title: schema.portfolioPages.title,
      slug: schema.portfolioPages.slug,
      published: sql<boolean>`exists (select 1 from published_snapshots s where s.portfolio_page_id = ${schema.portfolioPages.id} and s.is_current)`,
    })
    .from(schema.collectionItems)
    .innerJoin(schema.portfolioPages, eq(schema.collectionItems.portfolioPageId, schema.portfolioPages.id))
    .where(and(eq(schema.collectionItems.collectionId, showcaseId), isNull(schema.portfolioPages.deletedAt)))
    .orderBy(asc(schema.collectionItems.position));
}

export async function addToShowcase(db: Db, actor: Actor, pageId: string) {
  const page = await getPage(db, actor, pageId);
  assertCan(actor, "collection:update", { ownerId: page.ownerId });
  const showcaseId = await ensureShowcase(db, actor);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${schema.collectionItems.position}), 0)::int` })
    .from(schema.collectionItems)
    .where(eq(schema.collectionItems.collectionId, showcaseId));
  await db
    .insert(schema.collectionItems)
    .values({ collectionId: showcaseId, portfolioPageId: pageId, position: max + 1 })
    .onConflictDoNothing();
}

export async function removeFromShowcase(db: Db, actor: Actor, pageId: string) {
  const page = await getPage(db, actor, pageId);
  assertCan(actor, "collection:update", { ownerId: page.ownerId });
  const showcaseId = await ensureShowcase(db, actor);
  await db
    .delete(schema.collectionItems)
    .where(
      and(eq(schema.collectionItems.collectionId, showcaseId), eq(schema.collectionItems.portfolioPageId, pageId)),
    );
}

export async function moveInShowcase(db: Db, actor: Actor, pageId: string, direction: -1 | 1) {
  const items = await listShowcase(db, actor);
  const index = items.findIndex((i) => i.pageId === pageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  const showcaseId = await ensureShowcase(db, actor);
  const a = items[index];
  const b = items[target];
  await db.transaction(async (tx) => {
    await tx
      .update(schema.collectionItems)
      .set({ position: b.position })
      .where(
        and(eq(schema.collectionItems.collectionId, showcaseId), eq(schema.collectionItems.portfolioPageId, a.pageId)),
      );
    await tx
      .update(schema.collectionItems)
      .set({ position: a.position })
      .where(
        and(eq(schema.collectionItems.collectionId, showcaseId), eq(schema.collectionItems.portfolioPageId, b.pageId)),
      );
  });
}

// ---------------------------------------------------------------------------
// Favoriten
// ---------------------------------------------------------------------------

export async function listFavoriteIds(db: Db, actor: Actor, itemType: "report" | "page") {
  const rows = await db
    .select({ itemId: schema.favorites.itemId })
    .from(schema.favorites)
    .where(and(eq(schema.favorites.ownerId, actor.userId), eq(schema.favorites.itemType, itemType)));
  return new Set(rows.map((r) => r.itemId));
}

/** Schaltet einen Favoriten um. Prüft, dass das Element dem Owner gehört. */
export async function toggleFavorite(
  db: Db,
  actor: Actor,
  itemType: "report" | "page",
  itemId: string,
): Promise<boolean> {
  if (itemType === "report") await getReport(db, actor, itemId);
  else await getPage(db, actor, itemId);

  const where = and(
    eq(schema.favorites.ownerId, actor.userId),
    eq(schema.favorites.itemType, itemType),
    eq(schema.favorites.itemId, itemId),
  );
  const [existing] = await db.select({ id: schema.favorites.id }).from(schema.favorites).where(where);
  if (existing) {
    await db.delete(schema.favorites).where(eq(schema.favorites.id, existing.id));
    return false;
  }
  await db.insert(schema.favorites).values({ ownerId: actor.userId, itemType, itemId });
  return true;
}

/** Favorisierte Reports mit evtl. vorhandener Seite – Kandidaten für den Showcase. */
export async function listFavoriteReports(db: Db, actor: Actor) {
  const ids = [...(await listFavoriteIds(db, actor, "report"))];
  if (ids.length === 0) return [];
  return db
    .select({ id: schema.reports.id, title: schema.reports.title, pageId: schema.portfolioPages.id })
    .from(schema.reports)
    .leftJoin(
      schema.portfolioPages,
      and(eq(schema.portfolioPages.sourceReportId, schema.reports.id), isNull(schema.portfolioPages.deletedAt)),
    )
    .where(
      and(inArray(schema.reports.id, ids), eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt)),
    );
}
