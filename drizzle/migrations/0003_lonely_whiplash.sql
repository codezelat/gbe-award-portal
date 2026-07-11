ALTER TABLE "exports" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_idempotency_key_unique" UNIQUE("idempotency_key");