/**
 * Datenbankschema (Drizzle). Quelle der Wahrheit für Migrationen in `drizzle/`.
 *
 * Konventionen
 * - Fachliche IDs sind UUIDs (DB-generiert). `users.id` ist `text`, weil die Auth-Bibliothek
 *   (Inkrement 1) eigene String-IDs vergibt.
 * - Flexible Inhalte (Blöcke, Formularfelder, Seitenkonfigurationen) liegen als JSONB vor
 *   und werden vor jedem Schreiben per Zod validiert – die DB speichert sie typisiert.
 * - Zeitstempel immer `timestamptz`.
 * - Soft Delete über `deleted_at`; endgültiges Löschen nur nach Bestätigung.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  bigint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ContentDocument } from "@/content/blocks/schema";
import type { FieldDefinition } from "@/modules/reports/report-types";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const deletedAt = () => timestamp("deleted_at", { withTimezone: true });
const id = () => uuid("id").primaryKey().defaultRandom();
const ownerId = () =>
  text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["owner"]);
export const reportStatus = pgEnum("report_status", ["draft", "final", "archived"]);
export const classification = pgEnum("classification", ["private", "internal_sensitive", "publishable"]);
export const versionReason = pgEnum("version_reason", ["manual", "checkpoint", "restore", "ai_accepted"]);
export const relationSource = pgEnum("relation_source", ["manual", "ai_accepted"]);
export const projectStatus = pgEnum("project_status", ["planned", "active", "completed", "paused"]);
export const mediaKind = pgEnum("media_kind", ["image", "document", "code", "link"]);
export const pageKind = pgEnum("page_kind", ["profile", "case_study"]);
export const pageLocale = pgEnum("page_locale", ["de", "en"]);
export const favoriteItemType = pgEnum("favorite_item_type", ["report", "project", "page"]);
export const collectionKind = pgEnum("collection_kind", ["showcase", "custom"]);
export const shareScope = pgEnum("share_scope", ["page", "collection", "showcase"]);
export const aiJobStatus = pgEnum("ai_job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);
export const aiProposalStatus = pgEnum("ai_proposal_status", ["pending", "accepted", "rejected", "superseded"]);
export const riskLevel = pgEnum("risk_level", ["read", "low_metadata", "consequential"]);
export const actorType = pgEnum("actor_type", ["user", "ai", "system", "viewer"]);

// ---------------------------------------------------------------------------
// Nutzer (Auth-Tabellen für Sessions etc. folgen in Inkrement 1)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("owner"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Struktur: Fachgebiete, Kompetenzen, Projekte
// ---------------------------------------------------------------------------

export const subjectAreas = pgTable(
  "subject_areas",
  {
    id: id(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("subject_areas_owner_slug_uq").on(t.ownerId, t.slug)],
);

export const competencies = pgTable(
  "competencies",
  {
    id: id(),
    ownerId: ownerId(),
    subjectAreaId: uuid("subject_area_id").references(() => subjectAreas.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("competencies_owner_name_uq").on(t.ownerId, t.name)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    ownerId: ownerId(),
    subjectAreaId: uuid("subject_area_id").references(() => subjectAreas.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    status: projectStatus("status").notNull().default("active"),
    startedOn: date("started_on"),
    endedOn: date("ended_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("projects_owner_slug_uq").on(t.ownerId, t.slug)],
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reportTypes = pgTable("report_types", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  fieldSchema: jsonb("field_schema").$type<FieldDefinition[]>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reports = pgTable(
  "reports",
  {
    id: id(),
    ownerId: ownerId(),
    reportTypeId: uuid("report_type_id")
      .notNull()
      .references(() => reportTypes.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: reportStatus("status").notNull().default("draft"),
    classification: classification("classification").notNull().default("private"),
    /** Darf dieser Report an einen externen KI-Anbieter? Default: nein. */
    aiAllowed: boolean("ai_allowed").notNull().default(false),
    structuredFields: jsonb("structured_fields").$type<Record<string, unknown>>().notNull().default({}),
    content: jsonb("content").$type<ContentDocument>().notNull(),
    /** Vom Server beim Speichern aus `content` extrahiert (Volltextsuche, KI-Kontext). */
    plainText: text("plain_text").notNull().default(""),
    occurredOn: date("occurred_on"),
    /** Optimistische Nebenläufigkeit: jedes Speichern erhöht die Revision. */
    revision: integer("revision").notNull().default(1),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(plain_text, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("reports_owner_updated_idx").on(t.ownerId, t.updatedAt),
    index("reports_project_idx").on(t.projectId),
    index("reports_search_idx").using("gin", t.searchVector),
  ],
);

export const reportVersions = pgTable(
  "report_versions",
  {
    id: id(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    title: text("title").notNull(),
    structuredFields: jsonb("structured_fields").$type<Record<string, unknown>>().notNull(),
    content: jsonb("content").$type<ContentDocument>().notNull(),
    reason: versionReason("reason").notNull(),
    createdByType: actorType("created_by_type").notNull().default("user"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("report_versions_report_no_uq").on(t.reportId, t.versionNo)],
);

export const reportCompetencies = pgTable(
  "report_competencies",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    competencyId: uuid("competency_id")
      .notNull()
      .references(() => competencies.id, { onDelete: "cascade" }),
    evidenceNote: text("evidence_note"),
    source: relationSource("source").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.competencyId] })],
);

// ---------------------------------------------------------------------------
// Medien
// ---------------------------------------------------------------------------

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    ownerId: ownerId(),
    kind: mediaKind("kind").notNull(),
    /** SHA-256 des (bereinigten) Inhalts; null nur bei externen Links. */
    sha256: text("sha256"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    originalFilename: text("original_filename"),
    title: text("title"),
    altText: text("alt_text"),
    url: text("url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("media_assets_owner_sha_uq")
      .on(t.ownerId, t.sha256)
      .where(sql`${t.sha256} is not null`),
  ],
);

export const reportMedia = pgTable(
  "report_media",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    blockId: text("block_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.blockId] }), index("report_media_asset_idx").on(t.mediaAssetId)],
);

// ---------------------------------------------------------------------------
// Portfolio & Veröffentlichung
// ---------------------------------------------------------------------------

export const portfolioPages = pgTable(
  "portfolio_pages",
  {
    id: id(),
    ownerId: ownerId(),
    kind: pageKind("kind").notNull(),
    locale: pageLocale("locale").notNull().default("de"),
    sourceReportId: uuid("source_report_id").references(() => reports.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Arbeitsstand der Seite (PageConfig, Schema folgt in Inkrement 4). */
    draftConfig: jsonb("draft_config").$type<unknown>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("portfolio_pages_owner_slug_uq").on(t.ownerId, t.slug)],
);

export const publishedSnapshots = pgTable(
  "published_snapshots",
  {
    id: id(),
    portfolioPageId: uuid("portfolio_page_id")
      .notNull()
      .references(() => portfolioPages.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    /** Eingefrorene, vollständig aufgelöste Seite. Enthält KEINE privaten Medien-IDs. */
    config: jsonb("config").$type<unknown>().notNull(),
    sourceReportVersionId: uuid("source_report_version_id").references(() => reportVersions.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("published_snapshots_page_version_uq").on(t.portfolioPageId, t.versionNo),
    uniqueIndex("published_snapshots_one_current_uq")
      .on(t.portfolioPageId)
      .where(sql`${t.isCurrent}`),
  ],
);

export const publishedMedia = pgTable("published_media", {
  id: id(),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => publishedSnapshots.id, { onDelete: "cascade" }),
  /** Nur intern zur Nachverfolgung – wird nie an Viewer ausgeliefert. */
  sourceMediaAssetId: uuid("source_media_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text").notNull().default(""),
  createdAt: createdAt(),
});

export const favorites = pgTable(
  "favorites",
  {
    id: id(),
    ownerId: ownerId(),
    itemType: favoriteItemType("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("favorites_owner_item_uq").on(t.ownerId, t.itemType, t.itemId)],
);

export const collections = pgTable(
  "collections",
  {
    id: id(),
    ownerId: ownerId(),
    kind: collectionKind("kind").notNull().default("custom"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("collections_owner_slug_uq").on(t.ownerId, t.slug),
    uniqueIndex("collections_one_showcase_uq")
      .on(t.ownerId)
      .where(sql`${t.kind} = 'showcase'`),
  ],
);

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    portfolioPageId: uuid("portfolio_page_id")
      .notNull()
      .references(() => portfolioPages.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    visible: boolean("visible").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.portfolioPageId] })],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    ownerId: ownerId(),
    /** SHA-256 des Tokens (hex). Das Token selbst wird nie gespeichert. */
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull(),
    scopeType: shareScope("scope_type").notNull(),
    /** Seite oder Collection; bei `showcase` null. */
    scopeId: uuid("scope_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_owner_idx").on(t.ownerId)],
);

// ---------------------------------------------------------------------------
// KI
// ---------------------------------------------------------------------------

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: id(),
    ownerId: ownerId(),
    kind: text("kind").notNull(),
    status: aiJobStatus("status").notNull().default("queued"),
    provider: text("provider"),
    model: text("model"),
    /** Verweise auf Eingaben (IDs + Revisionen), nicht die Inhalte selbst. */
    inputRefs: jsonb("input_refs").$type<Record<string, unknown>>().notNull().default({}),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ai_jobs_owner_created_idx").on(t.ownerId, t.createdAt)],
);

export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: id(),
    aiJobId: uuid("ai_job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    riskLevel: riskLevel("risk_level").notNull(),
    rationale: text("rationale"),
    status: aiProposalStatus("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_proposals_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Betrieb: Audit & Rate-Limits
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Nur Metadaten – niemals Inhalte, Passwörter oder Tokens. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
  },
  (t) => [index("audit_events_at_idx").on(t.at), index("audit_events_target_idx").on(t.targetType, t.targetId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
