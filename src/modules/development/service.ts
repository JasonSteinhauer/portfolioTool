import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { slugify } from "@/modules/portfolio/service";
import { getReport } from "@/modules/reports/service";

/**
 * Qualitative Entwicklung: Fachgebiete, Kompetenzen und ihre Belege (Reports).
 * Bewusst ohne Prozentwerte oder Punktzahlen – Entwicklung zeigt sich an dokumentierter Arbeit.
 */

type Db = PostgresJsDatabase<typeof schema>;

export type FormResult = { ok: true } | { ok: false; error: string };

const nameSchema = z.string().trim().min(1, "Name fehlt").max(80, "Höchstens 80 Zeichen");
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Höchstens 500 Zeichen")
  .transform((v) => (v === "" ? null : v));

export async function createSubjectArea(db: Db, actor: Actor, raw: { name: unknown; description?: unknown }) {
  assertCan(actor, "competency:create");
  const parsed = z.object({ name: nameSchema, description: descriptionSchema }).safeParse({
    name: raw.name,
    description: raw.description ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message } satisfies FormResult;
  const slug = slugify(parsed.data.name);
  const inserted = await db
    .insert(schema.subjectAreas)
    .values({ ownerId: actor.userId, name: parsed.data.name, slug, description: parsed.data.description })
    .onConflictDoNothing()
    .returning({ id: schema.subjectAreas.id });
  if (inserted.length === 0) return { ok: false, error: "Ein Fachgebiet mit diesem Namen gibt es schon." };
  return { ok: true } satisfies FormResult;
}

export async function deleteSubjectArea(db: Db, actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return;
  assertCan(actor, "competency:delete");
  // Kompetenzen bleiben erhalten (Fremdschlüssel: set null).
  await db
    .delete(schema.subjectAreas)
    .where(and(eq(schema.subjectAreas.id, id), eq(schema.subjectAreas.ownerId, actor.userId)));
}

export async function createCompetency(
  db: Db,
  actor: Actor,
  raw: { name: unknown; description?: unknown; subjectAreaId?: unknown },
): Promise<FormResult> {
  assertCan(actor, "competency:create");
  const parsed = z
    .object({
      name: nameSchema,
      description: descriptionSchema,
      subjectAreaId: z
        .string()
        .transform((v) => (v === "" ? null : v))
        .pipe(z.uuid().nullable()),
    })
    .safeParse({ name: raw.name, description: raw.description ?? "", subjectAreaId: raw.subjectAreaId ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.subjectAreaId) {
    const [area] = await db
      .select({ id: schema.subjectAreas.id })
      .from(schema.subjectAreas)
      .where(and(eq(schema.subjectAreas.id, input.subjectAreaId), eq(schema.subjectAreas.ownerId, actor.userId)));
    if (!area) return { ok: false, error: "Unbekanntes Fachgebiet." };
  }
  const inserted = await db
    .insert(schema.competencies)
    .values({ ownerId: actor.userId, ...input })
    .onConflictDoNothing()
    .returning({ id: schema.competencies.id });
  if (inserted.length === 0) return { ok: false, error: "Diese Kompetenz gibt es schon." };
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "competency.created",
    targetType: "competency",
    targetId: inserted[0].id,
  });
  return { ok: true };
}

export async function deleteCompetency(db: Db, actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return;
  assertCan(actor, "competency:delete");
  const removed = await db
    .delete(schema.competencies)
    .where(and(eq(schema.competencies.id, id), eq(schema.competencies.ownerId, actor.userId)))
    .returning({ id: schema.competencies.id });
  if (removed.length > 0) {
    await recordAudit(db, {
      actorType: "user",
      actorId: actor.userId,
      action: "competency.deleted",
      targetType: "competency",
      targetId: id,
    });
  }
}

export async function listSubjectAreas(db: Db, actor: Actor) {
  assertCan(actor, "competency:read");
  return db
    .select({
      id: schema.subjectAreas.id,
      name: schema.subjectAreas.name,
      description: schema.subjectAreas.description,
    })
    .from(schema.subjectAreas)
    .where(eq(schema.subjectAreas.ownerId, actor.userId))
    .orderBy(asc(schema.subjectAreas.sortOrder), asc(schema.subjectAreas.name));
}

export type CompetencyOverview = {
  id: string;
  name: string;
  description: string | null;
  subjectAreaId: string | null;
  evidence: { reportId: string; title: string; typeName: string; date: string; note: string | null }[];
};

/** Kompetenzen mit ihren Belegen (nicht gelöschte Reports), neueste zuerst. */
export async function listCompetencies(db: Db, actor: Actor): Promise<CompetencyOverview[]> {
  assertCan(actor, "competency:read");
  const comps = await db
    .select()
    .from(schema.competencies)
    .where(eq(schema.competencies.ownerId, actor.userId))
    .orderBy(asc(schema.competencies.name));
  if (comps.length === 0) return [];
  const evidence = await db
    .select({
      competencyId: schema.reportCompetencies.competencyId,
      reportId: schema.reports.id,
      title: schema.reports.title,
      typeName: schema.reportTypes.name,
      note: schema.reportCompetencies.evidenceNote,
      date: sql<string>`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)::text`,
    })
    .from(schema.reportCompetencies)
    .innerJoin(schema.reports, eq(schema.reportCompetencies.reportId, schema.reports.id))
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(
      and(
        inArray(
          schema.reportCompetencies.competencyId,
          comps.map((c) => c.id),
        ),
        isNull(schema.reports.deletedAt),
      ),
    )
    .orderBy(desc(sql`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)`));
  return comps.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    subjectAreaId: c.subjectAreaId,
    evidence: evidence
      .filter((e) => e.competencyId === c.id)
      .map(({ reportId, title, typeName, date, note }) => ({ reportId, title, typeName, date, note })),
  }));
}

/** Kompetenzen eines Reports. */
export async function listReportCompetencies(db: Db, actor: Actor, reportId: string) {
  const report = await getReport(db, actor, reportId);
  return db
    .select({
      id: schema.competencies.id,
      name: schema.competencies.name,
      note: schema.reportCompetencies.evidenceNote,
    })
    .from(schema.reportCompetencies)
    .innerJoin(schema.competencies, eq(schema.reportCompetencies.competencyId, schema.competencies.id))
    .where(eq(schema.reportCompetencies.reportId, report.id))
    .orderBy(asc(schema.competencies.name));
}

export async function attachCompetency(
  db: Db,
  actor: Actor,
  reportId: string,
  competencyId: string,
  note: string,
): Promise<FormResult> {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  if (!z.uuid().safeParse(competencyId).success) return { ok: false, error: "Bitte eine Kompetenz wählen." };
  const [comp] = await db
    .select({ id: schema.competencies.id })
    .from(schema.competencies)
    .where(and(eq(schema.competencies.id, competencyId), eq(schema.competencies.ownerId, actor.userId)));
  if (!comp) return { ok: false, error: "Unbekannte Kompetenz." };
  const evidenceNote = note.trim().slice(0, 300) || null;
  await db
    .insert(schema.reportCompetencies)
    .values({ reportId: report.id, competencyId: comp.id, evidenceNote })
    .onConflictDoUpdate({
      target: [schema.reportCompetencies.reportId, schema.reportCompetencies.competencyId],
      set: { evidenceNote },
    });
  return { ok: true };
}

export async function detachCompetency(db: Db, actor: Actor, reportId: string, competencyId: string) {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  if (!z.uuid().safeParse(competencyId).success) return;
  await db
    .delete(schema.reportCompetencies)
    .where(
      and(eq(schema.reportCompetencies.reportId, report.id), eq(schema.reportCompetencies.competencyId, competencyId)),
    );
}

export type TimelineEntry =
  | {
      kind: "report";
      id: string;
      date: string;
      title: string;
      typeName: string;
      status: string;
      projectTitle: string | null;
      competencies: string[];
    }
  | { kind: "project"; id: string; date: string; title: string; event: "start" | "end" };

/** Chronologische Timeline aus Reports und Projekt-Start/-Ende, neueste zuerst. */
export async function getTimeline(db: Db, actor: Actor, limit = 200): Promise<TimelineEntry[]> {
  assertCan(actor, "report:read");
  const reports = await db
    .select({
      id: schema.reports.id,
      title: schema.reports.title,
      status: schema.reports.status,
      typeName: schema.reportTypes.name,
      projectTitle: schema.projects.title,
      date: sql<string>`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)::text`,
    })
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .leftJoin(schema.projects, and(eq(schema.reports.projectId, schema.projects.id), isNull(schema.projects.deletedAt)))
    .where(and(eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt)))
    .orderBy(desc(sql`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)`))
    .limit(limit);

  const ids = reports.map((r) => r.id);
  const comps =
    ids.length === 0
      ? []
      : await db
          .select({ reportId: schema.reportCompetencies.reportId, name: schema.competencies.name })
          .from(schema.reportCompetencies)
          .innerJoin(schema.competencies, eq(schema.reportCompetencies.competencyId, schema.competencies.id))
          .where(inArray(schema.reportCompetencies.reportId, ids));

  const projects = await db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      startedOn: schema.projects.startedOn,
      endedOn: schema.projects.endedOn,
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerId, actor.userId), isNull(schema.projects.deletedAt)));

  const entries: TimelineEntry[] = [
    ...reports.map((r) => ({
      kind: "report" as const,
      ...r,
      competencies: comps.filter((c) => c.reportId === r.id).map((c) => c.name),
    })),
    ...projects.flatMap((p) => [
      ...(p.startedOn
        ? [{ kind: "project" as const, id: p.id, date: p.startedOn, title: p.title, event: "start" as const }]
        : []),
      ...(p.endedOn
        ? [{ kind: "project" as const, id: p.id, date: p.endedOn, title: p.title, event: "end" as const }]
        : []),
    ]),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
