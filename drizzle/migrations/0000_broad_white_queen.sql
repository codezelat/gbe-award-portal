CREATE TYPE "public"."account_access_status" AS ENUM('not_created', 'pending_invite', 'invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('uploading', 'submitted', 'under_review', 'changes_requested', 'resubmitted', 'approved', 'entry_confirmed', 'shortlisted', 'winner', 'not_selected', 'rejected', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('draft', 'scheduled', 'open', 'closed', 'reviewing', 'results_pending', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('supporting_document', 'payment_proof', 'profile_original', 'profile_512', 'profile_96', 'export', 'brand', 'requested_document', 'other');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'uploaded', 'validating', 'ready', 'rejected', 'superseded', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('proof_submitted', 'under_review', 'verified', 'rejected', 'waived', 'refunded', 'not_required');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"field_keys" text[] NOT NULL,
	"requested_file_kinds" text[] NOT NULL,
	"instructions" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_field_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"state" text NOT NULL,
	"request_id" uuid,
	"expires_at" timestamp with time zone,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"replaces_application_file_id" uuid,
	"uploaded_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"sender_profile_id" uuid,
	"sender_type" text NOT NULL,
	"visibility" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"parent_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_by_applicant_at" timestamp with time zone,
	"read_by_staff_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"body" text NOT NULL,
	"note_type" text NOT NULL,
	"created_by" uuid NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"applicant_label" text NOT NULL,
	"applicant_message" text,
	"internal_reason" text,
	"changed_by_profile_id" uuid,
	"is_system_action" boolean DEFAULT false NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"changed_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text,
	"created_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"owner_profile_id" uuid,
	"workflow_status" "application_status" DEFAULT 'uploading' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'proof_submitted' NOT NULL,
	"account_access_status" "account_access_status" DEFAULT 'not_created' NOT NULL,
	"nominee_name" text NOT NULL,
	"designation" text,
	"industry_sector" text NOT NULL,
	"business_website" text,
	"email_normalised" text NOT NULL,
	"email_display" text NOT NULL,
	"phone_e164" text,
	"phone_display" text NOT NULL,
	"category_name_snapshot" text NOT NULL,
	"category_code_snapshot" text NOT NULL,
	"declaration_accepted" boolean NOT NULL,
	"declaration_text_snapshot" text NOT NULL,
	"declaration_version" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"form_schema_version" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"assigned_reviewer_id" uuid,
	"current_version" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_profile_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"application_id" uuid,
	"before_redacted" jsonb,
	"after_redacted" jsonb,
	"reason" text,
	"metadata_redacted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text,
	"internal_notes" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"capacity" integer,
	"fee_override_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"year" integer NOT NULL,
	"status" "cycle_status" DEFAULT 'draft' NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"results_release_at" timestamp with time zone,
	"support_email" text DEFAULT 'info@gbeaward.com' NOT NULL,
	"heading" text NOT NULL,
	"intro_copy" text NOT NULL,
	"nomination_fee_minor" bigint,
	"currency" char(3),
	"declaration_text" text NOT NULL,
	"declaration_version" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"form_schema_version" text NOT NULL,
	"brand_logo_file_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_cycles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cycle_sequences" (
	"cycle_id" uuid PRIMARY KEY NOT NULL,
	"next_application_number" integer DEFAULT 1 NOT NULL,
	"next_payment_number" integer DEFAULT 1 NOT NULL,
	"next_receipt_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_profile_id" uuid,
	"application_id" uuid,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_message_id" text,
	"last_error_code" text,
	"last_error_summary" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"format" text NOT NULL,
	"report_key" text NOT NULL,
	"query_snapshot" jsonb NOT NULL,
	"status" text NOT NULL,
	"file_id" uuid,
	"row_count" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"original_filename" text,
	"safe_download_filename" text,
	"extension" text,
	"mime_type_claimed" text,
	"mime_type_detected" text,
	"size_bytes" bigint NOT NULL,
	"etag" text,
	"sha256" text,
	"width" integer,
	"height" integer,
	"created_by_profile_id" uuid,
	"created_via_public_submission" boolean DEFAULT false NOT NULL,
	"validated_at" timestamp with time zone,
	"rejection_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalised" text NOT NULL,
	"application_id" uuid,
	"profile_id" uuid,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"token_hash" text,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "payment_status" NOT NULL,
	"currency" char(3),
	"amount_minor" bigint,
	"proof_application_file_id" uuid,
	"payer_name" text,
	"bank_reference" text,
	"paid_at" timestamp with time zone,
	"submitted_note" text,
	"finance_note" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"account_kind" text NOT NULL,
	"nominee_kind" text DEFAULT 'unknown' NOT NULL,
	"display_name" text NOT NULL,
	"official_name" text,
	"profile_image_file_id" uuid,
	"designation" text,
	"industry_sector" text,
	"phone_e164" text,
	"phone_display" text,
	"alternate_email" text,
	"business_website" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country_code" char(2),
	"short_bio" text,
	"linkedin_url" text,
	"facebook_url" text,
	"instagram_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"can_view_all_applications" boolean DEFAULT false NOT NULL,
	"mfa_required" boolean DEFAULT true NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_memberships_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"public_token_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"expected_manifest" jsonb NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"request_fingerprint_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_sessions_public_token_hash_unique" UNIQUE("public_token_hash"),
	CONSTRAINT "upload_sessions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_change_requests" ADD CONSTRAINT "application_change_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_change_requests" ADD CONSTRAINT "application_change_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_field_access" ADD CONSTRAINT "application_field_access_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_field_access" ADD CONSTRAINT "application_field_access_request_id_application_change_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."application_change_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_field_access" ADD CONSTRAINT "application_field_access_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_uploaded_by_profile_id_profiles_id_fk" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_sender_profile_id_profiles_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_profile_id_profiles_id_fk" FOREIGN KEY ("changed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_category_id_award_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."award_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_reviewer_id_profiles_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_categories" ADD CONSTRAINT "award_categories_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_cycles" ADD CONSTRAINT "award_cycles_brand_logo_file_id_files_id_fk" FOREIGN KEY ("brand_logo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_sequences" ADD CONSTRAINT "cycle_sequences_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_application_file_id_application_files_id_fk" FOREIGN KEY ("proof_application_file_id") REFERENCES "public"."application_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_profile_image_file_id_files_id_fk" FOREIGN KEY ("profile_image_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "field_access_application_key_uidx" ON "application_field_access" USING btree ("application_id","field_key");--> statement-breakpoint
CREATE INDEX "messages_application_created_idx" ON "application_messages" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_versions_number_uidx" ON "application_versions" USING btree ("application_id","version");--> statement-breakpoint
CREATE INDEX "applications_cycle_status_submitted_idx" ON "applications" USING btree ("cycle_id","workflow_status","submitted_at","id");--> statement-breakpoint
CREATE INDEX "applications_payment_idx" ON "applications" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "applications_reviewer_idx" ON "applications" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "applications_category_idx" ON "applications" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "applications_email_idx" ON "applications" USING btree ("email_normalised");--> statement-breakpoint
CREATE INDEX "audit_entity_created_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_application_created_idx" ON "audit_logs" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_cycle_code_uidx" ON "award_categories" USING btree ("cycle_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_cycle_slug_uidx" ON "award_categories" USING btree ("cycle_id","slug");--> statement-breakpoint
CREATE INDEX "email_outbox_queue_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "files_purpose_status_idx" ON "files" USING btree ("purpose","status");