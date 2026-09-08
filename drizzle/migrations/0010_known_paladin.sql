ALTER TYPE "public"."payment_status" ADD VALUE 'awaiting_payment' BEFORE 'proof_submitted';--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"transaction_id" text,
	"checkout_url" text,
	"state" text DEFAULT 'CREATING' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expected_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_transaction_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_active_idx" ON "payment_attempts" USING btree ("payment_id") WHERE "payment_attempts"."active" = true;--> statement-breakpoint
CREATE INDEX "payment_attempts_payment_idx" ON "payment_attempts" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gateway_transaction_id_unique" UNIQUE("gateway_transaction_id");