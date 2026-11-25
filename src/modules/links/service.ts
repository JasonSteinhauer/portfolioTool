import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { getReport } from "@/modules/reports/service";

/**
 * Verknüpfungen zwischen Reports. Eine Verknüpfung ist gerichtet: `source` steht in der
 * Hierarchie oben, `target` baut darauf auf. Die Verknüpfungen bilden einen Graphen ohne Zyklen,
 * damit die Karte eindeutig von oben nach unten gelesen werden kann.
 */

type Db = PostgresJsDatabase<typeof schema>;

export type LinkResult = { ok: true } | { ok: false; error: string };

export const MAX_LINKS_PER_REPORT = 50;

/** Gibt es bereits einen Weg von `from` nach `to`? */
async function reachable(db: Db, ownerId: string, from: string, to: string): Promise<boolean> {
  const rows = await db.execute<{ hit: number }>(sql`
    with recursive walk(id) as (
      select ${from}::uuid
      union
      select l.target_report_id from report_links l
      join walk w on l.source_report_id = w.id
      where l.owner_id = ${ownerId}
    )
    select 1 as hit from walk where id = ${to}::uuid limit 1
  `);
  return rows.length > 0;
}

/** Legt fest, dass `targetId` auf `sourceId` aufbaut (source oben, target darunter). */
export async function addLink(db: Db, actor: Actor, sourceId: string, targetId: string): Promise<LinkResult> {
  if (!z.uuid().safeParse(sourceId).success || !z.uuid().safeParse(targetId).success) {
    return { ok: false, error: "Ungültiger Report." };
  }
  if (sourceId === targetId) return { ok: false, error: "Ein Report kann nicht mit sich selbst verknüpft werden." };
  const [source, target] = await Promise.all([getReport(db, actor, sourceId), getReport(db, actor, targetId)]);
  assertCan(actor, "report:update", { ownerId: source.ownerId });
  assertCan(actor, "report:update", { ownerId: target.ownerId });

  if (await reachable(db, actor.userId, targetId, sourceId)) {
    return {
      ok: false,
      error: `„${source.title}“ baut bereits (indirekt) auf „${target.title}“ auf – das ergäbe einen Kreis.`,
    };
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reportLinks)
    .where(or(eq(schema.reportLinks.sourceReportId, sourceId), eq(schema.reportLinks.targetReportId, sourceId)));
  if (n >= MAX_LINKS_PER_REPORT) return { ok: false, error: "Zu viele Verknüpfungen für diesen Report." };

  const inserted = await db
    .insert(schema.reportLinks)
    .values({ ownerId: actor.userId, sourceReportId: sourceId, targetReportId: targetId })
    .onConflictDoNothing()
    .returning({ s: schema.reportLinks.sourceReportId });
  if (inserted.length > 0) {
    await recordAudit(db, {
      actorType: "user",
      actorId: actor.userId,
      action: "report.link_added",
      targetType: "report",
      targetId: targetId,
      metadata: { sourceReportId: sourceId },
    });
  }
  return { ok: true };
}

export async function removeLink(db: Db, actor: Actor, sourceId: string, targetId: string): Promise<void> {
  if (!z.uuid().safeParse(sourceId).success || !z.uuid().safeParse(targetId).success) return;
  assertCan(actor, "report:update");
  const removed = await db
    .delete(schema.reportLinks)
    .where(
      and(
        eq(schema.reportLinks.ownerId, actor.userId),
        eq(schema.reportLinks.sourceReportId, sourceId),
        eq(schema.reportLinks.targetReportId, targetId),
      ),
    )
    .returning({ s: schema.reportLinks.sourceReportId });
  if (removed.length > 0) {
    await recordAudit(db, {
      actorType: "user",
      actorId: actor.userId,
      action: "report.link_removed",
      targetType: "report",
      targetId: targetId,
      metadata: { sourceReportId: sourceId },
    });
  }
}

export type LinkedReport = { id: string; title: string; typeName: string; status: string };

/** Nachbarn eines Reports: worauf er aufbaut (oben) und was auf ihm aufbaut (unten). */
export async function listLinks(db: Db, actor: Actor, reportId: string) {
  const report = await getReport(db, actor, reportId);
  const rows = await db
    .select({
      sourceId: schema.reportLinks.sourceReportId,
      targetId: schema.reportLinks.targetReportId,
      id: schema.reports.id,
      title: schema.reports.title,
      status: schema.reports.status,
      typeName: schema.reportTypes.name,
    })
    .from(schema.reportLinks)
    .innerJoin(
      schema.reports,
      sql`${schema.reports.id} = case when ${schema.reportLinks.sourceReportId} = ${report.id} then ${schema.reportLinks.targetReportId} else ${schema.reportLinks.sourceReportId} end`,
    )
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(
      and(
        eq(schema.reportLinks.ownerId, actor.userId),
        isNull(schema.reports.deletedAt),
        or(eq(schema.reportLinks.sourceReportId, report.id), eq(schema.reportLinks.targetReportId, report.id)),
      ),
    )
    .orderBy(schema.reports.title);
  const pick = ({ id, title, typeName, status }: (typeof rows)[number]): LinkedReport => ({
    id,
    title,
    typeName,
    status,
  });
  return {
    buildsOn: rows.filter((r) => r.targetId === report.id).map(pick),
    leadsTo: rows.filter((r) => r.sourceId === report.id).map(pick),
  };
}

// ---------------------------------------------------------------------------
// Karte
// ---------------------------------------------------------------------------

export type MapReport = {
  id: string;
  title: string;
  typeName: string;
  status: string;
  projectId: string | null;
};
export type MapProject = { id: string; title: string; status: string };
export type MapData = {
  projects: MapProject[];
  reports: MapReport[];
  links: { source: string; target: string }[];
  /** Reports aus anderen Projekten, die nur wegen einer Verknüpfung sichtbar sind. */
  externalIds: string[];
};

export const MAP_REPORT_LIMIT = 400;

/**
 * Daten für die Karte. Mit `projectId` nur dieses Projekt plus direkt verknüpfte Reports
 * anderer Projekte (als „extern“ markiert).
 */
export async function getMapData(db: Db, actor: Actor, filter: { projectId?: string } = {}): Promise<MapData> {
  assertCan(actor, "report:read");
  assertCan(actor, "project:read");
  const projectId = filter.projectId && z.uuid().safeParse(filter.projectId).success ? filter.projectId : undefined;

  const projects = await db
    .select({ id: schema.projects.id, title: schema.projects.title, status: schema.projects.status })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.ownerId, actor.userId),
        isNull(schema.projects.deletedAt),
        projectId ? eq(schema.projects.id, projectId) : undefined,
      ),
    )
    .orderBy(schema.projects.createdAt);

  const reportSelect = {
    id: schema.reports.id,
    title: schema.reports.title,
    status: schema.reports.status,
    projectId: schema.reports.projectId,
    typeName: schema.reportTypes.name,
  };
  const base = and(eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt));

  let reports: MapReport[] = await db
    .select(reportSelect)
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(and(base, projectId ? eq(schema.reports.projectId, projectId) : undefined))
    .orderBy(schema.reports.createdAt)
    .limit(MAP_REPORT_LIMIT);

  const ids = reports.map((r) => r.id);
  let links =
    ids.length === 0
      ? []
      : await db
          .select({ source: schema.reportLinks.sourceReportId, target: schema.reportLinks.targetReportId })
          .from(schema.reportLinks)
          .where(
            and(
              eq(schema.reportLinks.ownerId, actor.userId),
              projectId
                ? or(inArray(schema.reportLinks.sourceReportId, ids), inArray(schema.reportLinks.targetReportId, ids))
                : undefined,
            ),
          );

  const externalIds: string[] = [];
  if (projectId) {
    const known = new Set(ids);
    const missing = [...new Set(links.flatMap((l) => [l.source, l.target]).filter((id) => !known.has(id)))];
    if (missing.length > 0) {
      const extra = await db
        .select(reportSelect)
        .from(schema.reports)
        .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
        .where(and(base, inArray(schema.reports.id, missing)));
      reports = [...reports, ...extra];
      externalIds.push(...extra.map((r) => r.id));
    }
  }
  const visible = new Set(reports.map((r) => r.id));
  links = links.filter((l) => visible.has(l.source) && visible.has(l.target));
  return { projects, reports, links, externalIds };
}
