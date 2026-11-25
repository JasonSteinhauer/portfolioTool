import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { slugify } from "@/modules/portfolio/service";
import { getReport } from "@/modules/reports/service";

/**
 * Projekte bündeln zusammengehörige Reports. Ein Report gehört zu höchstens einem Projekt.
 * Gelöschte Projekte landen nicht im Papierkorb: ihre Reports bleiben erhalten und werden
 * nur aus dem Projekt gelöst.
 */

type Db = PostgresJsDatabase<typeof schema>;

export const PROJECT_STATUS = ["planned", "active", "paused", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
};

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Projekt nicht gefunden");
    this.name = "ProjectNotFoundError";
  }
}

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.iso.date("Ungültiges Datum").nullable());

export const projectInputSchema = z
  .object({
    title: z.string().trim().min(1, "Titel fehlt").max(160, "Höchstens 160 Zeichen"),
    summary: z
      .string()
      .trim()
      .max(2000, "Höchstens 2000 Zeichen")
      .transform((v) => (v === "" ? null : v)),
    status: z.enum(PROJECT_STATUS),
    startedOn: optionalDate,
    endedOn: optionalDate,
  })
  .refine((p) => !p.startedOn || !p.endedOn || p.startedOn <= p.endedOn, {
    message: "Ende liegt vor dem Start",
    path: ["endedOn"],
  });
export type ProjectInput = z.input<typeof projectInputSchema>;

export type ProjectResult = { ok: true; id: string } | { ok: false; fieldErrors: Record<string, string> };

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".") || "_"] ??= issue.message;
  return out;
}

async function uniqueProjectSlug(db: Db, ownerId: string, base: string, exceptId?: string) {
  const rows = await db
    .select({ id: schema.projects.id, slug: schema.projects.slug })
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerId, ownerId), sql`${schema.projects.slug} like ${base + "%"}`));
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function listProjects(db: Db, actor: Actor) {
  assertCan(actor, "project:read");
  const reportCount = db
    .select({ projectId: schema.reports.projectId, n: count().as("n") })
    .from(schema.reports)
    .where(and(eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt)))
    .groupBy(schema.reports.projectId)
    .as("rc");
  return db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      summary: schema.projects.summary,
      status: schema.projects.status,
      startedOn: schema.projects.startedOn,
      endedOn: schema.projects.endedOn,
      updatedAt: schema.projects.updatedAt,
      reportCount: sql<number>`coalesce(${reportCount.n}, 0)::int`,
    })
    .from(schema.projects)
    .leftJoin(reportCount, eq(reportCount.projectId, schema.projects.id))
    .where(and(eq(schema.projects.ownerId, actor.userId), isNull(schema.projects.deletedAt)))
    .orderBy(
      sql`case ${schema.projects.status} when 'active' then 0 when 'planned' then 1 when 'paused' then 2 else 3 end`,
      desc(schema.projects.updatedAt),
    );
}

export async function getProject(db: Db, actor: Actor, projectId: string) {
  if (!z.uuid().safeParse(projectId).success) throw new ProjectNotFoundError();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project || project.deletedAt) throw new ProjectNotFoundError();
  try {
    assertCan(actor, "project:read", { ownerId: project.ownerId });
  } catch {
    throw new ProjectNotFoundError();
  }
  return project;
}

export async function listProjectReports(db: Db, actor: Actor, projectId: string) {
  const project = await getProject(db, actor, projectId);
  return db
    .select({
      id: schema.reports.id,
      title: schema.reports.title,
      status: schema.reports.status,
      occurredOn: schema.reports.occurredOn,
      updatedAt: schema.reports.updatedAt,
      typeName: schema.reportTypes.name,
    })
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(and(eq(schema.reports.projectId, project.id), isNull(schema.reports.deletedAt)))
    .orderBy(asc(sql`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)`));
}

export async function createProject(db: Db, actor: Actor, raw: unknown): Promise<ProjectResult> {
  assertCan(actor, "project:create");
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const slug = await uniqueProjectSlug(db, actor.userId, slugify(input.title));
  const [row] = await db
    .insert(schema.projects)
    .values({ ownerId: actor.userId, slug, ...input })
    .returning({ id: schema.projects.id });
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "project.created",
    targetType: "project",
    targetId: row.id,
  });
  return { ok: true, id: row.id };
}

export async function updateProject(db: Db, actor: Actor, projectId: string, raw: unknown): Promise<ProjectResult> {
  const project = await getProject(db, actor, projectId);
  assertCan(actor, "project:update", { ownerId: project.ownerId });
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const slug =
    input.title === project.title
      ? project.slug
      : await uniqueProjectSlug(db, actor.userId, slugify(input.title), project.id);
  await db
    .update(schema.projects)
    .set({ ...input, slug, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  return { ok: true, id: project.id };
}

/** Löscht ein Projekt (weich). Zugehörige Reports bleiben erhalten und sind danach ohne Projekt. */
export async function deleteProject(db: Db, actor: Actor, projectId: string) {
  const project = await getProject(db, actor, projectId);
  assertCan(actor, "project:delete", { ownerId: project.ownerId });
  await db.transaction(async (tx) => {
    await tx.update(schema.reports).set({ projectId: null }).where(eq(schema.reports.projectId, project.id));
    await tx.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, project.id));
  });
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "project.deleted",
    targetType: "project",
    targetId: project.id,
  });
}

/** Ordnet einen Report einem Projekt zu (`null` = ohne Projekt). */
export async function assignReportToProject(db: Db, actor: Actor, reportId: string, projectId: string | null) {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  if (projectId) await getProject(db, actor, projectId);
  if (report.projectId === projectId) return;
  // Bewusst ohne Revisionserhöhung: die Zuordnung ist Metadatum und soll offene Editoren nicht blockieren.
  await db.update(schema.reports).set({ projectId }).where(eq(schema.reports.id, report.id));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.project_changed",
    targetType: "report",
    targetId: report.id,
    metadata: { projectId },
  });
}

/** Reports ohne Projekt – Auswahl für „Report hinzufügen“. */
export async function listUnassignedReports(db: Db, actor: Actor) {
  assertCan(actor, "report:read");
  return db
    .select({ id: schema.reports.id, title: schema.reports.title })
    .from(schema.reports)
    .where(
      and(eq(schema.reports.ownerId, actor.userId), isNull(schema.reports.deletedAt), isNull(schema.reports.projectId)),
    )
    .orderBy(desc(schema.reports.updatedAt))
    .limit(200);
}

/** Projekt-Titel für eine Menge von IDs (z. B. für Anzeigen in Report-Listen). */
export async function projectTitles(db: Db, actor: Actor, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.ownerId, actor.userId),
        inArray(schema.projects.id, ids),
        isNull(schema.projects.deletedAt),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.title]));
}
