CREATE TABLE "special_invite_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"discount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"quantity" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "special_invite_batches_discount_positive" CHECK ("special_invite_batches"."discount_minor" > 0),
	CONSTRAINT "special_invite_batches_quantity_valid" CHECK ("special_invite_batches"."quantity" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "special_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code_encrypted" text NOT NULL,
	"draft_id" uuid,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"original_amount_minor" bigint,
	"amount_minor" bigint,
	"application_id" uuid,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "special_invites_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "special_invites_draft_id_unique" UNIQUE("draft_id"),
	CONSTRAINT "special_invites_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "special_invites_claim_valid" CHECK ((
    "special_invites"."draft_id" is null and "special_invites"."claimed_at" is null and "special_invites"."expires_at" is null and "special_invites"."original_amount_minor" is null and "special_invites"."amount_minor" is null
  ) or (
    "special_invites"."draft_id" is not null and "special_invites"."claimed_at" is not null and "special_invites"."expires_at" = "special_invites"."claimed_at" + interval '1 hour'
    and "special_invites"."original_amount_minor" > "special_invites"."amount_minor" and "special_invites"."amount_minor" > 0
  )),
	CONSTRAINT "special_invites_consumption_valid" CHECK ((
    "special_invites"."consumed_at" is null and "special_invites"."application_id" is null
  ) or (
    "special_invites"."consumed_at" is not null and "special_invites"."application_id" is not null and "special_invites"."draft_id" is not null
    and "special_invites"."revoked_at" is null and "special_invites"."consumed_at" >= "special_invites"."claimed_at" and "special_invites"."consumed_at" < "special_invites"."expires_at"
  ))
);
--> statement-breakpoint
ALTER TABLE "special_invite_batches" ADD CONSTRAINT "special_invite_batches_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_invite_batches" ADD CONSTRAINT "special_invite_batches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_invites" ADD CONSTRAINT "special_invites_batch_id_special_invite_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."special_invite_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_invites" ADD CONSTRAINT "special_invites_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_invites" ADD CONSTRAINT "special_invites_draft_id_nomination_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."nomination_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_invites" ADD CONSTRAINT "special_invites_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "special_invite_batches_cycle_idx" ON "special_invite_batches" USING btree ("cycle_id","created_at");--> statement-breakpoint
CREATE INDEX "special_invites_cycle_created_idx" ON "special_invites" USING btree ("cycle_id","created_at","id");--> statement-breakpoint
CREATE INDEX "special_invites_batch_idx" ON "special_invites" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "special_invites_unused_idx" ON "special_invites" USING btree ("cycle_id") WHERE "special_invites"."draft_id" is null and "special_invites"."revoked_at" is null;