CREATE TYPE "public"."actor_type" AS ENUM('user', 'ai', 'system', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."classification" AS ENUM('private', 'internal_sensitive', 'publishable');--> statement-breakpoint
CREATE TYPE "public"."collection_kind" AS ENUM('showcase', 'custom');--> statement-breakpoint
CREATE TYPE "public"."favorite_item_type" AS ENUM('report', 'project', 'page');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'document', 'code', 'link');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('profile', 'case_study');--> statement-breakpoint
CREATE TYPE "public"."page_locale" AS ENUM('de', 'en');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."relation_source" AS ENUM('manual', 'ai_accepted');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'final', 'archived');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('read', 'low_metadata', 'consequential');--> statement-breakpoint
CREATE TYPE "public"."share_scope" AS ENUM('page', 'collection', 'showcase');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner');--> statement-breakpoint
CREATE TYPE "public"."version_reason" AS ENUM('manual', 'checkpoint', 'restore', 'ai_accepted');--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"input_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micro_usd" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_job_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"rationale" text,
	"status" "ai_proposal_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"portfolio_page_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "collection_items_collection_id_portfolio_page_id_pk" PRIMARY KEY("collection_id","portfolio_page_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "collection_kind" DEFAULT 'custom' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"subject_area_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"item_type" "favorite_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"sha256" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" bigint,
	"width" integer,
	"height" integer,
	"original_filename" text,
	"title" text,
	"alt_text" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolio_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "page_kind" NOT NULL,
	"locale" "page_locale" DEFAULT 'de' NOT NULL,
	"source_report_id" uuid,
	"project_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"draft_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"subject_area_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "published_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source_media_asset_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_page_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"config" jsonb NOT NULL,
	"source_report_version_id" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "report_competencies" (
	"report_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"evidence_note" text,
	"source" "relation_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_competencies_report_id_competency_id_pk" PRIMARY KEY("report_id","competency_id")
);
--> statement-breakpoint
CREATE TABLE "report_media" (
	"report_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	CONSTRAINT "report_media_report_id_block_id_pk" PRIMARY KEY("report_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "report_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"field_schema" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"title" text NOT NULL,
	"structured_fields" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"reason" "version_reason" NOT NULL,
	"created_by_type" "actor_type" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"report_type_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"classification" "classification" DEFAULT 'private' NOT NULL,
	"ai_allowed" boolean DEFAULT false NOT NULL,
	"structured_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"occurred_on" date,
	"revision" integer DEFAULT 1 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(plain_text, '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"scope_type" "share_scope" NOT NULL,
	"scope_id" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_access_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subject_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_ai_job_id_ai_jobs_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_portfolio_page_id_portfolio_pages_id_fk" FOREIGN KEY ("portfolio_page_id") REFERENCES "public"."portfolio_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_subject_area_id_subject_areas_id_fk" FOREIGN KEY ("subject_area_id") REFERENCES "public"."subject_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_source_report_id_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_subject_area_id_subject_areas_id_fk" FOREIGN KEY ("subject_area_id") REFERENCES "public"."subject_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_media" ADD CONSTRAINT "published_media_snapshot_id_published_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."published_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_media" ADD CONSTRAINT "published_media_source_media_asset_id_media_assets_id_fk" FOREIGN KEY ("source_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_snapshots" ADD CONSTRAINT "published_snapshots_portfolio_page_id_portfolio_pages_id_fk" FOREIGN KEY ("portfolio_page_id") REFERENCES "public"."portfolio_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_snapshots" ADD CONSTRAINT "published_snapshots_source_report_version_id_report_versions_id_fk" FOREIGN KEY ("source_report_version_id") REFERENCES "public"."report_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_competencies" ADD CONSTRAINT "report_competencies_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_competencies" ADD CONSTRAINT "report_competencies_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_report_type_id_report_types_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_areas" ADD CONSTRAINT "subject_areas_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_owner_created_idx" ON "ai_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_proposals_status_idx" ON "ai_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_owner_slug_uq" ON "collections" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_one_showcase_uq" ON "collections" USING btree ("owner_id") WHERE "collections"."kind" = 'showcase';--> statement-breakpoint
CREATE UNIQUE INDEX "competencies_owner_name_uq" ON "competencies" USING btree ("owner_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_owner_item_uq" ON "favorites" USING btree ("owner_id","item_type","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_owner_sha_uq" ON "media_assets" USING btree ("owner_id","sha256") WHERE "media_assets"."sha256" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_pages_owner_slug_uq" ON "portfolio_pages" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_slug_uq" ON "projects" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "published_snapshots_page_version_uq" ON "published_snapshots" USING btree ("portfolio_page_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "published_snapshots_one_current_uq" ON "published_snapshots" USING btree ("portfolio_page_id") WHERE "published_snapshots"."is_current";--> statement-breakpoint
CREATE INDEX "report_media_asset_idx" ON "report_media" USING btree ("media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_versions_report_no_uq" ON "report_versions" USING btree ("report_id","version_no");--> statement-breakpoint
CREATE INDEX "reports_owner_updated_idx" ON "reports" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "reports_project_idx" ON "reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "reports_search_idx" ON "reports" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "share_links_owner_idx" ON "share_links" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_areas_owner_slug_uq" ON "subject_areas" USING btree ("owner_id","slug");