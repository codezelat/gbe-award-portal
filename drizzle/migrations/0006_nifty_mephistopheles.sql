ALTER TABLE "payments" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_reference_unique" UNIQUE("payment_reference");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_reference_unique" UNIQUE("receipt_reference");