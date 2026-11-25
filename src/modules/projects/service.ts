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
    parentProjectId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid("Unbekanntes Projekt").nullable())
      .optional()
      .default(null),
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

export const MAX_PROJECT_DEPTH = 3;

type TreeRow = { id: string; parentProjectId: string | null };

/** Ebene eines Projekts (1 = oberste Ebene). Robust gegen fehlerhafte Daten (Kreise). */
export function projectDepth(rows: TreeRow[], id: string): number {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let depth = 1;
  let current = byId.get(id)?.parentProjectId ?? null;
  const seen = new Set([id]);
  while (current && !seen.has(current) && byId.has(current)) {
    seen.add(current);
    depth++;
    current = byId.get(current)!.parentProjectId;
  }
  return depth;
}

/** Alle Nachfahren eines Projekts (ohne das Projekt selbst). */
export function descendantIds(rows: TreeRow[], id: string): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const r of rows) {
      if (r.parentProjectId === current && !out.has(r.id) && r.id !== id) {
        out.add(r.id);
        queue.push(r.id);
      }
    }
  }
  return out;
}

/** Höhe des Teilbaums (1 = keine Unterprojekte). */
function subtreeHeight(rows: TreeRow[], id: string, guard = new Set<string>()): number {
  if (guard.has(id)) return 1;
  guard.add(id);
  const children = rows.filter((r) => r.parentProjectId === id);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(rows, c.id, guard)));
}

/** Prüft ein neues Elternprojekt. Liefert eine Fehlermeldung oder `null`. */
function parentError(rows: TreeRow[], projectId: string | null, parentId: string | null): string | null {
  if (!parentId) return null;
  if (!rows.some((r) => r.id === parentId)) return "Unbekanntes Projekt";
  if (projectId && (parentId === projectId || descendantIds(rows, projectId).has(parentId))) {
    return "Ein Projekt kann nicht unter sich selbst oder seinen Unterprojekten liegen";
  }
  const height = projectId ? subtreeHeight(rows, projectId) : 1;
  if (projectDepth(rows, parentId) + height > MAX_PROJECT_DEPTH) {
    return `Höchstens ${MAX_PROJECT_DEPTH} Ebenen`;
  }
  return null;
}

async function ownTree(db: Db, ownerId: string) {
  return db
    .select({
      id: schema.projects.id,
      parentProjectId: schema.projects.parentProjectId,
      sortOrder: schema.projects.sortOrder,
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerId, ownerId), isNull(schema.projects.deletedAt)));
}

async function nextSortOrder(db: Db, ownerId: string, parentId: string | null) {
  const rows = await ownTree(db, ownerId);
  return Math.max(-1, ...rows.filter((r) => r.parentProjectId === parentId).map((r) => r.sortOrder)) + 1;
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
      parentProjectId: schema.projects.parentProjectId,
      sortOrder: schema.projects.sortOrder,
      reportCount: sql<number>`coalesce(${reportCount.n}, 0)::int`,
    })
    .from(schema.projects)
    .leftJoin(reportCount, eq(reportCount.projectId, schema.projects.id))
    .where(and(eq(schema.projects.ownerId, actor.userId), isNull(schema.projects.deletedAt)))
    .orderBy(asc(schema.projects.sortOrder), asc(schema.projects.createdAt));
}

export type ProjectTreeItem = Awaited<ReturnType<typeof listProjects>>[number] & {
  depth: number;
  childCount: number;
  /** Reports inkl. aller Unterprojekte. */
  totalReports: number;
};

/** Projekte als Baum in Anzeige-Reihenfolge (Vorordnung), mit Ebene und Anzahl Unterprojekte. */
export function toProjectTree(rows: Awaited<ReturnType<typeof listProjects>>): ProjectTreeItem[] {
  const ids = new Set(rows.map((r) => r.id));
  const childrenOf = (parent: string | null) =>
    rows.filter((r) => (r.parentProjectId && ids.has(r.parentProjectId) ? r.parentProjectId : null) === parent);
  const total = (id: string, guard = new Set<string>()): number => {
    if (guard.has(id)) return 0;
    guard.add(id);
    const self = rows.find((r) => r.id === id)?.reportCount ?? 0;
    return self + childrenOf(id).reduce((sum, c) => sum + total(c.id, guard), 0);
  };
  const out: ProjectTreeItem[] = [];
  const visit = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const r of childrenOf(parent)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ ...r, depth, childCount: childrenOf(r.id).length, totalReports: total(r.id) });
      visit(r.id, depth + 1, seen);
    }
  };
  visit(null, 1, new Set());
  return out;
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

export async function listProjectReports(
  db: Db,
  actor: Actor,
  projectId: string,
  options: { includeSubprojects?: boolean } = {},
) {
  const project = await getProject(db, actor, projectId);
  const ids = options.includeSubprojects ? await projectWithDescendants(db, actor, project.id) : [project.id];
  return db
    .select({
      projectId: schema.reports.projectId,
      projectTitle: schema.projects.title,
      id: schema.reports.id,
      title: schema.reports.title,
      status: schema.reports.status,
      occurredOn: schema.reports.occurredOn,
      updatedAt: schema.reports.updatedAt,
      typeName: schema.reportTypes.name,
    })
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .innerJoin(schema.projects, eq(schema.reports.projectId, schema.projects.id))
    .where(and(inArray(schema.reports.projectId, ids), isNull(schema.reports.deletedAt)))
    .orderBy(asc(sql`coalesce(${schema.reports.occurredOn}, ${schema.reports.createdAt}::date)`));
}

export async function createProject(db: Db, actor: Actor, raw: unknown): Promise<ProjectResult> {
  assertCan(actor, "project:create");
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const problem = parentError(await ownTree(db, actor.userId), null, input.parentProjectId);
  if (problem) return { ok: false, fieldErrors: { parentProjectId: problem } };
  const slug = await uniqueProjectSlug(db, actor.userId, slugify(input.title));
  const sortOrder = await nextSortOrder(db, actor.userId, input.parentProjectId);
  const [row] = await db
    .insert(schema.projects)
    .values({ ownerId: actor.userId, slug, sortOrder, ...input })
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
  const problem = parentError(await ownTree(db, actor.userId), project.id, input.parentProjectId);
  if (problem) return { ok: false, fieldErrors: { parentProjectId: problem } };
  const sortOrder =
    input.parentProjectId === project.parentProjectId
      ? project.sortOrder
      : await nextSortOrder(db, actor.userId, input.parentProjectId);
  const slug =
    input.title === project.title
      ? project.slug
      : await uniqueProjectSlug(db, actor.userId, slugify(input.title), project.id);
  await db
    .update(schema.projects)
    .set({ ...input, slug, sortOrder, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  return { ok: true, id: project.id };
}

/** Löscht ein Projekt (weich). Zugehörige Reports bleiben erhalten und sind danach ohne Projekt. */
export async function deleteProject(db: Db, actor: Actor, projectId: string) {
  const project = await getProject(db, actor, projectId);
  assertCan(actor, "project:delete", { ownerId: project.ownerId });
  await db.transaction(async (tx) => {
    await tx.update(schema.reports).set({ projectId: null }).where(eq(schema.reports.projectId, project.id));
    // Unterprojekte rücken eine Ebene nach oben.
    await tx
      .update(schema.projects)
      .set({ parentProjectId: project.parentProjectId })
      .where(eq(schema.projects.parentProjectId, project.id));
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

/** Hängt ein Projekt unter ein anderes (`null` = oberste Ebene). Prüft Kreise und Tiefe. */
export async function setProjectParent(
  db: Db,
  actor: Actor,
  projectId: string,
  parentId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await getProject(db, actor, projectId);
  assertCan(actor, "project:update", { ownerId: project.ownerId });
  if (parentId) await getProject(db, actor, parentId);
  if (project.parentProjectId === parentId) return { ok: true };
  const problem = parentError(await ownTree(db, actor.userId), project.id, parentId);
  if (problem) return { ok: false, error: problem };
  await db
    .update(schema.projects)
    .set({
      parentProjectId: parentId,
      sortOrder: await nextSortOrder(db, actor.userId, parentId),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));
  return { ok: true };
}

/** Verschiebt ein Projekt unter seinen Geschwistern nach oben (-1) oder unten (+1). */
export async function moveProject(db: Db, actor: Actor, projectId: string, dir: -1 | 1) {
  const project = await getProject(db, actor, projectId);
  assertCan(actor, "project:update", { ownerId: project.ownerId });
  const siblings = (await ownTree(db, actor.userId))
    .filter((r) => r.parentProjectId === project.parentProjectId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((r) => r.id === project.id);
  const target = index + dir;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  await db.transaction(async (tx) => {
    for (const [i, r] of siblings.entries()) {
      await tx.update(schema.projects).set({ sortOrder: i }).where(eq(schema.projects.id, r.id));
    }
  });
}

/** Pfad von der obersten Ebene bis zum Elternprojekt (für die Brotkrumen). */
export async function projectAncestors(db: Db, actor: Actor, projectId: string) {
  const project = await getProject(db, actor, projectId);
  const rows = await db
    .select({ id: schema.projects.id, title: schema.projects.title, parentProjectId: schema.projects.parentProjectId })
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerId, actor.userId), isNull(schema.projects.deletedAt)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: { id: string; title: string }[] = [];
  let current = project.parentProjectId;
  while (current && byId.has(current) && out.length < MAX_PROJECT_DEPTH + 2) {
    const row = byId.get(current)!;
    out.unshift({ id: row.id, title: row.title });
    current = row.parentProjectId;
  }
  return out;
}

/** IDs eines Projekts und aller Unterprojekte. */
export async function projectWithDescendants(db: Db, actor: Actor, projectId: string): Promise<string[]> {
  const project = await getProject(db, actor, projectId);
  return [project.id, ...descendantIds(await ownTree(db, actor.userId), project.id)];
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
