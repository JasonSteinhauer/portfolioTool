import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import type { CaseStudySnapshot, ProfileSnapshot } from "@/modules/portfolio/service";

/**
 * Widerrufbare Freigabelinks.
 *
 * - Token: 32 zufällige Bytes (base64url). Gespeichert wird nur der SHA-256-Hash.
 * - Ein Link gibt entweder den Showcase (Profil + ausgewählte Seiten) oder genau eine Seite frei.
 * - Jeder Viewer-Request prüft den Link neu: Widerruf und Ablauf wirken sofort.
 * - Viewer sehen ausschließlich aktuelle Snapshots, nie Entwürfe oder Reports.
 */

type Db = PostgresJsDatabase<typeof schema>;

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export const createLinkSchema = z.discriminatedUnion("scopeType", [
  z.object({
    scopeType: z.literal("showcase"),
    label: z.string().trim().min(1).max(80),
    expiresInDays: z.number().int().min(1).max(365).nullable(),
  }),
  z.object({
    scopeType: z.literal("page"),
    scopeId: z.uuid(),
    label: z.string().trim().min(1).max(80),
    expiresInDays: z.number().int().min(1).max(365).nullable(),
  }),
]);

export async function createShareLink(db: Db, actor: Actor, input: unknown) {
  assertCan(actor, "share_link:create");
  const data = createLinkSchema.parse(input);
  if (data.scopeType === "page") {
    const [page] = await db
      .select({ ownerId: schema.portfolioPages.ownerId })
      .from(schema.portfolioPages)
      .where(
        and(
          eq(schema.portfolioPages.id, data.scopeId),
          eq(schema.portfolioPages.kind, "case_study"),
          isNull(schema.portfolioPages.deletedAt),
        ),
      );
    if (!page) throw new Error("Seite nicht gefunden");
    assertCan(actor, "portfolio_page:share", { ownerId: page.ownerId });
  }

  const token = generateToken();
  const [link] = await db
    .insert(schema.shareLinks)
    .values({
      ownerId: actor.userId,
      tokenHash: hashToken(token),
      label: data.label,
      scopeType: data.scopeType,
      scopeId: data.scopeType === "page" ? data.scopeId : null,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null,
    })
    .returning({ id: schema.shareLinks.id });

  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "share_link.created",
    targetType: "share_link",
    targetId: link.id,
    metadata: { scope: data.scopeType },
  });
  // Das Token wird genau einmal zurückgegeben und nirgends gespeichert.
  return { id: link.id, token };
}

export async function listShareLinks(db: Db, actor: Actor) {
  assertCan(actor, "share_link:read");
  const rows = await db
    .select({
      id: schema.shareLinks.id,
      label: schema.shareLinks.label,
      scopeType: schema.shareLinks.scopeType,
      pageTitle: schema.portfolioPages.title,
      createdAt: schema.shareLinks.createdAt,
      expiresAt: schema.shareLinks.expiresAt,
      revokedAt: schema.shareLinks.revokedAt,
      accessCount: schema.shareLinks.accessCount,
      lastAccessAt: schema.shareLinks.lastAccessAt,
    })
    .from(schema.shareLinks)
    .leftJoin(schema.portfolioPages, eq(schema.shareLinks.scopeId, schema.portfolioPages.id))
    .where(eq(schema.shareLinks.ownerId, actor.userId))
    .orderBy(desc(schema.shareLinks.createdAt));
  const now = Date.now();
  return rows.map((row) => ({ ...row, expired: row.expiresAt !== null && row.expiresAt.getTime() <= now }));
}

export async function revokeShareLink(db: Db, actor: Actor, linkId: string) {
  if (!z.uuid().safeParse(linkId).success) return;
  const [link] = await db
    .select({ ownerId: schema.shareLinks.ownerId })
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.id, linkId));
  if (!link) return;
  assertCan(actor, "share_link:delete", { ownerId: link.ownerId });
  await db
    .update(schema.shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.shareLinks.id, linkId), isNull(schema.shareLinks.revokedAt)));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "share_link.revoked",
    targetType: "share_link",
    targetId: linkId,
  });
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

export type ResolvedLink = {
  id: string;
  ownerId: string;
  scopeType: "page" | "collection" | "showcase";
  scopeId: string | null;
};

/** Prüft ein Token. Liefert den Link nur, wenn er existiert, nicht widerrufen und nicht abgelaufen ist. */
export async function resolveShareToken(
  db: Db,
  token: string | undefined | null,
  options: { countAccess?: boolean } = {},
): Promise<ResolvedLink | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashToken(token);
  const [link] = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.tokenHash, tokenHash));
  if (!link) return null;
  // Zusätzlich zeitkonstant vergleichen (Index-Lookup ist bereits über den Hash).
  if (!timingSafeEqual(Buffer.from(link.tokenHash, "hex"), Buffer.from(tokenHash, "hex"))) return null;
  if (link.revokedAt || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) return null;

  if (options.countAccess) {
    await db
      .update(schema.shareLinks)
      .set({ accessCount: sql`${schema.shareLinks.accessCount} + 1`, lastAccessAt: new Date() })
      .where(eq(schema.shareLinks.id, link.id));
  }
  return { id: link.id, ownerId: link.ownerId, scopeType: link.scopeType, scopeId: link.scopeId };
}

type PublishedPage = { pageId: string; slug: string; approvedAt: Date; snapshot: CaseStudySnapshot };

async function currentSnapshots(db: Db, ownerId: string, pageIds?: string[]) {
  const rows = await db
    .select({
      pageId: schema.portfolioPages.id,
      kind: schema.portfolioPages.kind,
      slug: schema.portfolioPages.slug,
      approvedAt: schema.publishedSnapshots.approvedAt,
      config: schema.publishedSnapshots.config,
    })
    .from(schema.publishedSnapshots)
    .innerJoin(schema.portfolioPages, eq(schema.publishedSnapshots.portfolioPageId, schema.portfolioPages.id))
    .where(
      and(
        eq(schema.portfolioPages.ownerId, ownerId),
        eq(schema.publishedSnapshots.isCurrent, true),
        isNull(schema.portfolioPages.deletedAt),
      ),
    );
  return pageIds ? rows.filter((r) => pageIds.includes(r.pageId)) : rows;
}

/** Inhalt der Startseite für einen Link: Profil + Showcase (bzw. nur die eine Seite). */
export async function getViewerHome(
  db: Db,
  link: ResolvedLink,
): Promise<{ profile: ProfileSnapshot["profile"] | null; pages: PublishedPage[] }> {
  const all = await currentSnapshots(db, link.ownerId);
  const profileRow = all.find((r) => r.kind === "profile");
  const profile = link.scopeType === "showcase" && profileRow ? (profileRow.config as ProfileSnapshot).profile : null;

  let pageIds: string[] = [];
  if (link.scopeType === "page" && link.scopeId) pageIds = [link.scopeId];
  if (link.scopeType === "showcase") {
    const items = await db
      .select({ pageId: schema.collectionItems.portfolioPageId })
      .from(schema.collectionItems)
      .innerJoin(schema.collections, eq(schema.collectionItems.collectionId, schema.collections.id))
      .where(
        and(
          eq(schema.collections.ownerId, link.ownerId),
          eq(schema.collections.kind, "showcase"),
          eq(schema.collectionItems.visible, true),
        ),
      )
      .orderBy(asc(schema.collectionItems.position));
    pageIds = items.map((i) => i.pageId);
  }

  const pages = pageIds
    .map((id) => all.find((r) => r.pageId === id && r.kind === "case_study"))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      pageId: r.pageId,
      slug: r.slug,
      approvedAt: r.approvedAt,
      snapshot: r.config as CaseStudySnapshot,
    }));
  return { profile, pages };
}

/** Eine einzelne freigegebene Seite – nur wenn der Link sie umfasst. */
export async function getViewerPage(db: Db, link: ResolvedLink, slug: string): Promise<PublishedPage | null> {
  const home = await getViewerHome(db, link);
  return home.pages.find((p) => p.slug === slug) ?? null;
}

/**
 * Eine eingefrorene Bilddatei für den Viewer – nur, wenn sie zum AKTUELLEN Snapshot einer Seite gehört,
 * die der Link umfasst. Alles andere (fremd, alt, widerrufen, außerhalb des Umfangs) → null.
 */
export async function getViewerMedia(
  db: Db,
  link: ResolvedLink,
  mediaId: string,
): Promise<{ storageKey: string; mimeType: string } | null> {
  if (!z.uuid().safeParse(mediaId).success) return null;
  const [row] = await db
    .select({
      storageKey: schema.publishedMedia.storageKey,
      mimeType: schema.publishedMedia.mimeType,
      pageId: schema.publishedSnapshots.portfolioPageId,
    })
    .from(schema.publishedMedia)
    .innerJoin(schema.publishedSnapshots, eq(schema.publishedSnapshots.id, schema.publishedMedia.snapshotId))
    .where(and(eq(schema.publishedMedia.id, mediaId), eq(schema.publishedSnapshots.isCurrent, true)));
  if (!row) return null;
  const { pages } = await getViewerHome(db, link);
  if (!pages.some((p) => p.pageId === row.pageId)) return null;
  return { storageKey: row.storageKey, mimeType: row.mimeType };
}
