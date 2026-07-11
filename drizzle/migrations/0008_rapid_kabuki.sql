ALTER TABLE "two_factor" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "failed_verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");