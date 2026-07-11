CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error_summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "job_runs_key_started_idx" ON "job_runs" USING btree ("job_key","started_at");--> statement-breakpoint
CREATE INDEX "job_runs_status_started_idx" ON "job_runs" USING btree ("status","started_at");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_version_nonnegative" CHECK ("applications"."current_version" >= 0);--> statement-breakpoint
ALTER TABLE "award_categories" ADD CONSTRAINT "categories_display_order_nonnegative" CHECK ("award_categories"."display_order" >= 0);--> statement-breakpoint
ALTER TABLE "award_categories" ADD CONSTRAINT "categories_capacity_positive" CHECK ("award_categories"."capacity" is null or "award_categories"."capacity" > 0);--> statement-breakpoint
ALTER TABLE "award_categories" ADD CONSTRAINT "categories_fee_nonnegative" CHECK ("award_categories"."fee_override_minor" is null or "award_categories"."fee_override_minor" >= 0);--> statement-breakpoint
ALTER TABLE "award_cycles" ADD CONSTRAINT "award_cycles_valid_window" CHECK ("award_cycles"."closes_at" > "award_cycles"."opens_at");--> statement-breakpoint
ALTER TABLE "award_cycles" ADD CONSTRAINT "award_cycles_fee_nonnegative" CHECK ("award_cycles"."nomination_fee_minor" is null or "award_cycles"."nomination_fee_minor" >= 0);--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_size_nonnegative" CHECK ("files"."size_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_dimensions_positive" CHECK (("files"."width" is null or "files"."width" > 0) and ("files"."height" is null or "files"."height" > 0));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonnegative" CHECK ("payments"."amount_minor" is null or "payments"."amount_minor" >= 0);