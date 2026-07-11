CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_reference_trgm_idx" ON "applications" USING gin ("reference" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_nominee_trgm_idx" ON "applications" USING gin ("nominee_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_email_trgm_idx" ON "applications" USING gin ("email_normalised" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_phone_trgm_idx" ON "applications" USING gin ("phone_display" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_active_activity_idx" ON "applications" ("last_activity_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND "workflow_status" <> 'uploading';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_files_application_current_idx" ON "application_files" ("application_id", "is_current", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_requests_application_status_idx" ON "application_change_requests" ("application_id", "status", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_status_expiry_idx" ON "invitations" ("status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_status_created_idx" ON "files" ("status", "created_at");
