CREATE TABLE "nomination_draft_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "nomination_draft_files_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "nomination_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"cycle_id" uuid NOT NULL,
	"application_id" uuid,
	"payload" jsonb NOT NULL,
	"saved_step" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nomination_drafts_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "nomination_drafts_step_valid" CHECK ("nomination_drafts"."saved_step" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "nomination_draft_files" ADD CONSTRAINT "nomination_draft_files_draft_id_nomination_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."nomination_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomination_draft_files" ADD CONSTRAINT "nomination_draft_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomination_drafts" ADD CONSTRAINT "nomination_drafts_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomination_drafts" ADD CONSTRAINT "nomination_drafts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nomination_draft_files_draft_idx" ON "nomination_draft_files" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "nomination_drafts_pending_idx" ON "nomination_drafts" USING btree ("cycle_id","updated_at","id") WHERE "nomination_drafts"."deleted_at" is null and "nomination_drafts"."submitted_at" is null;