import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { contentDocumentSchema, emptyDocument, type ContentDocument } from "@/content/blocks/schema";
import { collectMediaRefs, extractPlainText } from "@/content/blocks/utils";
import * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { buildStructuredFieldsSchema, fieldSchemaSchema, type FieldDefinition } from "./report-types";

/**
 * Fachlogik für Reports. Jede Funktion bekommt den Akteur und prüft die Berechtigung
 * selbst (`assertCan`). Fremde oder gelöschte Reports werden wie "nicht vorhanden" behandelt.
 */

type Db = PostgresJsDatabase<typeof schema>;

export const CHECKPOINT_INTERVAL_MS = 10 * 60_000;
export const CLASSIFICATIONS = ["private", "internal_sensitive", "publishable"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export class ReportNotFoundError extends Error {
  constructor() {
    super("Report nicht gefunden");
    this.name = "ReportNotFoundError";
  }
}

export type FieldErrors = Record<string, string>;

export type SaveResult =
  | { ok: true; revision: number; status: "draft" | "final"; savedAt: Date; reopened: boolean }
  | { ok: false; reason: "conflict"; currentRevision: number }
  | { ok: false; reason: "invalid"; fieldErrors: FieldErrors };

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function listReportTypes(db: Db) {
  const rows = await db
    .select()
    .from(schema.reportTypes)
    .where(eq(schema.reportTypes.isActive, true))
    .orderBy(schema.reportTypes.sortOrder);
  return rows.map((row) => ({ ...row, fieldSchema: fieldSchemaSchema.parse(row.fieldSchema) as FieldDefinition[] }));
}

export const listFilterSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  type: z.string().max(40).optional().catch(undefined),
  status: z.enum(["draft", "final", "archived"]).optional().catch(undefined),
  trash: z.coerce.boolean().optional().catch(false),
});
export type ListFilter = z.infer<typeof listFilterSchema>;

export async function listReports(db: Db, actor: Actor, filter: ListFilter = {}, limit = 100) {
  assertCan(actor, "report:read");
  const conditions = [
    eq(schema.reports.ownerId, actor.userId),
    filter.trash ? isNotNull(schema.reports.deletedAt) : isNull(schema.reports.deletedAt),
  ];
  if (filter.status) conditions.push(eq(schema.reports.status, filter.status));
  if (filter.type) conditions.push(eq(schema.reportTypes.key, filter.type));
  if (filter.q) conditions.push(sql`${schema.reports.searchVector} @@ plainto_tsquery('simple', ${filter.q})`);

  return db
    .select({
      id: schema.reports.id,
      title: schema.reports.title,
      status: schema.reports.status,
      classification: schema.reports.classification,
      occurredOn: schema.reports.occurredOn,
      updatedAt: schema.reports.updatedAt,
      deletedAt: schema.reports.deletedAt,
      typeKey: schema.reportTypes.key,
      typeName: schema.reportTypes.name,
    })
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(and(...conditions))
    .orderBy(desc(schema.reports.updatedAt))
    .limit(limit);
}

export async function getReport(db: Db, actor: Actor, reportId: string, options: { includeDeleted?: boolean } = {}) {
  if (!z.uuid().safeParse(reportId).success) throw new ReportNotFoundError();
  const [row] = await db
    .select({ report: schema.reports, type: schema.reportTypes })
    .from(schema.reports)
    .innerJoin(schema.reportTypes, eq(schema.reports.reportTypeId, schema.reportTypes.id))
    .where(eq(schema.reports.id, reportId));
  if (!row || (!options.includeDeleted && row.report.deletedAt)) throw new ReportNotFoundError();
  // Fremde Reports: nach außen "nicht gefunden".
  try {
    assertCan(actor, "report:read", { ownerId: row.report.ownerId });
  } catch {
    throw new ReportNotFoundError();
  }
  return {
    ...row.report,
    type: { ...row.type, fieldSchema: fieldSchemaSchema.parse(row.type.fieldSchema) as FieldDefinition[] },
  };
}

// ---------------------------------------------------------------------------
// Anlegen & Speichern
// ---------------------------------------------------------------------------

export async function createReport(db: Db, actor: Actor, input: { typeKey: string; title?: string }) {
  assertCan(actor, "report:create");
  const [type] = await db
    .select()
    .from(schema.reportTypes)
    .where(and(eq(schema.reportTypes.key, input.typeKey), eq(schema.reportTypes.isActive, true)));
  if (!type) throw new Error("Unbekannter Report-Typ");

  const title = (input.title ?? "").trim().slice(0, 200) || `${type.name} – Entwurf`;
  const [report] = await db
    .insert(schema.reports)
    .values({ ownerId: actor.userId, reportTypeId: type.id, title, content: emptyDocument(), structuredFields: {} })
    .returning({ id: schema.reports.id });

  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.created",
    targetType: "report",
    targetId: report.id,
    metadata: { type: type.key },
  });
  return report;
}

export const saveInputSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(200),
  structuredFields: z.record(z.string(), z.unknown()),
  content: contentDocumentSchema,
  classification: z.enum(CLASSIFICATIONS),
  aiAllowed: z.boolean(),
  /** Revision, auf der die Änderung basiert (optimistische Nebenläufigkeit). */
  revision: z.number().int().positive(),
  /** "Version speichern" erzeugt immer eine Version, sonst höchstens alle 10 Minuten ein Checkpoint. */
  manual: z.boolean().default(false),
});
export type SaveInput = z.input<typeof saveInputSchema>;

function zodFieldErrors(error: z.ZodError, prefix = ""): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = prefix + (issue.path.join(".") || "_");
    errors[key] ??= issue.message;
  }
  return errors;
}

async function assertMediaOwned(db: Db, actor: Actor, content: ContentDocument): Promise<boolean> {
  const ids = [...new Set(collectMediaRefs(content).map((r) => r.mediaId))];
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(
      and(
        inArray(schema.mediaAssets.id, ids),
        eq(schema.mediaAssets.ownerId, actor.userId),
        isNull(schema.mediaAssets.deletedAt),
      ),
    );
  return rows.length === ids.length;
}

export async function saveReport(
  db: Db,
  actor: Actor,
  reportId: string,
  rawInput: unknown,
  /** `ai_accepted`: übernommene KI-Vorschläge – sichert den vorherigen Stand UND den neuen als Version. */
  options: { versionReason?: "ai_accepted" } = {},
): Promise<SaveResult> {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });

  const parsed = saveInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: zodFieldErrors(parsed.error) };
  const input = parsed.data;

  const fields = buildStructuredFieldsSchema(report.type.fieldSchema, "draft").safeParse(input.structuredFields);
  if (!fields.success)
    return { ok: false, reason: "invalid", fieldErrors: zodFieldErrors(fields.error, "structuredFields.") };

  if (!(await assertMediaOwned(db, actor, input.content))) {
    return { ok: false, reason: "invalid", fieldErrors: { content: "Unbekannte Mediendatei im Dokument" } };
  }

  // Abgeschlossene Reports bleiben nur abgeschlossen, solange alle Pflichtfelder gefüllt sind.
  let status: "draft" | "final" = report.status === "final" ? "final" : "draft";
  let reopened = false;
  if (
    status === "final" &&
    !buildStructuredFieldsSchema(report.type.fieldSchema, "final").safeParse(fields.data).success
  ) {
    status = "draft";
    reopened = true;
  }

  // Sensibel eingestufte Inhalte gehen nie an externe KI – serverseitig erzwungen.
  const aiAllowed = input.classification === "internal_sensitive" ? false : input.aiAllowed;
  const occurredOn =
    typeof fields.data.occurredOn === "string" && fields.data.occurredOn ? fields.data.occurredOn : null;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.reports)
      .set({
        title: input.title,
        structuredFields: fields.data,
        content: input.content,
        plainText: extractPlainText(input.content),
        classification: input.classification,
        aiAllowed,
        occurredOn,
        status,
        revision: sql`${schema.reports.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.reports.id, reportId),
          eq(schema.reports.revision, input.revision),
          isNull(schema.reports.deletedAt),
        ),
      )
      .returning({ revision: schema.reports.revision, updatedAt: schema.reports.updatedAt });

    if (updated.length === 0) {
      const [current] = await tx
        .select({ revision: schema.reports.revision })
        .from(schema.reports)
        .where(eq(schema.reports.id, reportId));
      return { ok: false as const, reason: "conflict" as const, currentRevision: current?.revision ?? 0 };
    }

    // Medienverweise synchronisieren.
    await tx.delete(schema.reportMedia).where(eq(schema.reportMedia.reportId, reportId));
    const refs = collectMediaRefs(input.content);
    if (refs.length > 0) {
      await tx
        .insert(schema.reportMedia)
        .values(refs.map((r) => ({ reportId, mediaAssetId: r.mediaId, blockId: r.blockId })));
    }

    // Version: bei manuellem Speichern immer, sonst als Checkpoint höchstens alle 10 Minuten.
    const [last] = await tx
      .select({ versionNo: schema.reportVersions.versionNo, createdAt: schema.reportVersions.createdAt })
      .from(schema.reportVersions)
      .where(eq(schema.reportVersions.reportId, reportId))
      .orderBy(desc(schema.reportVersions.versionNo))
      .limit(1);
    if (options.versionReason === "ai_accepted") {
      const base = last?.versionNo ?? 0;
      await tx.insert(schema.reportVersions).values([
        {
          reportId,
          versionNo: base + 1,
          title: report.title,
          structuredFields: report.structuredFields,
          content: report.content,
          reason: "checkpoint",
        },
        {
          reportId,
          versionNo: base + 2,
          title: input.title,
          structuredFields: fields.data,
          content: input.content,
          reason: "ai_accepted",
        },
      ]);
      return { ok: true as const, revision: updated[0].revision, status, savedAt: updated[0].updatedAt, reopened };
    }
    const due = !last || Date.now() - last.createdAt.getTime() >= CHECKPOINT_INTERVAL_MS;
    if (input.manual || due) {
      await tx.insert(schema.reportVersions).values({
        reportId,
        versionNo: (last?.versionNo ?? 0) + 1,
        title: input.title,
        structuredFields: fields.data,
        content: input.content,
        reason: input.manual ? "manual" : "checkpoint",
      });
    }

    return { ok: true as const, revision: updated[0].revision, status, savedAt: updated[0].updatedAt, reopened };
  });
}

/** Schließt einen Report ab – nur wenn alle Pflichtfelder gefüllt sind. */
export async function finalizeReport(
  db: Db,
  actor: Actor,
  reportId: string,
): Promise<{ ok: true } | { ok: false; fieldErrors: FieldErrors }> {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  const result = buildStructuredFieldsSchema(report.type.fieldSchema, "final").safeParse(report.structuredFields);
  if (!result.success) return { ok: false, fieldErrors: zodFieldErrors(result.error, "structuredFields.") };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.reports)
      .set({ status: "final", updatedAt: new Date(), revision: sql`${schema.reports.revision} + 1` })
      .where(eq(schema.reports.id, reportId));
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.reportVersions.versionNo}), 0)::int` })
      .from(schema.reportVersions)
      .where(eq(schema.reportVersions.reportId, reportId));
    await tx.insert(schema.reportVersions).values({
      reportId,
      versionNo: max + 1,
      title: report.title,
      structuredFields: report.structuredFields,
      content: report.content,
      reason: "manual",
    });
  });
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.finalized",
    targetType: "report",
    targetId: reportId,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Versionen
// ---------------------------------------------------------------------------

export async function listVersions(db: Db, actor: Actor, reportId: string) {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:read", { ownerId: report.ownerId });
  return db
    .select({
      id: schema.reportVersions.id,
      versionNo: schema.reportVersions.versionNo,
      title: schema.reportVersions.title,
      reason: schema.reportVersions.reason,
      createdAt: schema.reportVersions.createdAt,
      content: schema.reportVersions.content,
    })
    .from(schema.reportVersions)
    .where(eq(schema.reportVersions.reportId, reportId))
    .orderBy(desc(schema.reportVersions.versionNo));
}

/**
 * Stellt eine Version wieder her. Der aktuelle Stand wird vorher als Version gesichert,
 * damit nichts verloren geht – Wiederherstellen ist also selbst rückgängig zu machen.
 */
export async function restoreVersion(db: Db, actor: Actor, reportId: string, versionId: string) {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  if (!z.uuid().safeParse(versionId).success) throw new ReportNotFoundError();

  await db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(schema.reportVersions)
      .where(and(eq(schema.reportVersions.id, versionId), eq(schema.reportVersions.reportId, reportId)));
    if (!version) throw new ReportNotFoundError();

    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.reportVersions.versionNo}), 0)::int` })
      .from(schema.reportVersions)
      .where(eq(schema.reportVersions.reportId, reportId));

    await tx.insert(schema.reportVersions).values({
      reportId,
      versionNo: max + 1,
      title: report.title,
      structuredFields: report.structuredFields,
      content: report.content,
      reason: "checkpoint",
    });
    await tx
      .update(schema.reports)
      .set({
        title: version.title,
        structuredFields: version.structuredFields,
        content: version.content,
        plainText: extractPlainText(version.content),
        status: "draft",
        revision: sql`${schema.reports.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.reports.id, reportId));
    await tx.insert(schema.reportVersions).values({
      reportId,
      versionNo: max + 2,
      title: version.title,
      structuredFields: version.structuredFields,
      content: version.content,
      reason: "restore",
    });
  });
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.version_restored",
    targetType: "report",
    targetId: reportId,
    metadata: { versionId },
  });
}

// ---------------------------------------------------------------------------
// Papierkorb
// ---------------------------------------------------------------------------

export async function moveToTrash(db: Db, actor: Actor, reportId: string) {
  const report = await getReport(db, actor, reportId);
  assertCan(actor, "report:delete", { ownerId: report.ownerId });
  await db.update(schema.reports).set({ deletedAt: new Date() }).where(eq(schema.reports.id, reportId));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.deleted",
    targetType: "report",
    targetId: reportId,
    metadata: { soft: true },
  });
}

export async function restoreFromTrash(db: Db, actor: Actor, reportId: string) {
  const report = await getReport(db, actor, reportId, { includeDeleted: true });
  assertCan(actor, "report:update", { ownerId: report.ownerId });
  await db.update(schema.reports).set({ deletedAt: null }).where(eq(schema.reports.id, reportId));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "report.restored",
    targetType: "report",
    targetId: reportId,
  });
}
