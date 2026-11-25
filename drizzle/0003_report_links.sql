CREATE TABLE "report_links" (
	"owner_id" text NOT NULL,
	"source_report_id" uuid NOT NULL,
	"target_report_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_links_source_report_id_target_report_id_pk" PRIMARY KEY("source_report_id","target_report_id"),
	CONSTRAINT "report_links_no_self" CHECK ("report_links"."source_report_id" <> "report_links"."target_report_id")
);
--> statement-breakpoint
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_source_report_id_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_target_report_id_reports_id_fk" FOREIGN KEY ("target_report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_links_target_idx" ON "report_links" USING btree ("target_report_id");