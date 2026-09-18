CREATE TABLE "guest_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"code" text NOT NULL,
	"position" integer NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_tickets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ticket_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sales_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"access_hash" text NOT NULL,
	"payload_hash" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"business_name" text,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"event_title" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"venue" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'public' NOT NULL,
	"issued_by" uuid,
	"internal_reason" text,
	"hold_until" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"email_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "ticket_bookings_bounds" CHECK ("ticket_bookings"."quantity" between 1 and 20 and "ticket_bookings"."unit_price_minor" >= 0 and "ticket_bookings"."amount_minor" = "ticket_bookings"."quantity" * "ticket_bookings"."unit_price_minor"),
	CONSTRAINT "ticket_bookings_status" CHECK ("ticket_bookings"."status" in ('pending','paid','issued','expired','cancelled','review','refunded')),
	CONSTRAINT "ticket_bookings_source" CHECK ("ticket_bookings"."source" in ('public','staff'))
);
--> statement-breakpoint
CREATE TABLE "ticket_payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"transaction_id" text,
	"checkout_url" text,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"state" text DEFAULT 'CREATING' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_payment_attempts_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "ticket_payment_attempts_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "ticket_attempts_amount" CHECK ("ticket_payment_attempts"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'LKR' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"max_per_booking" integer DEFAULT 10 NOT NULL,
	"event_at" timestamp with time zone,
	"venue" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_sales_cycle_id_unique" UNIQUE("cycle_id"),
	CONSTRAINT "ticket_sales_bounds" CHECK ("ticket_sales"."capacity" between 0 and 100000 and "ticket_sales"."unit_price_minor" between 0 and 100000000 and "ticket_sales"."max_per_booking" between 1 and 20),
	CONSTRAINT "ticket_sales_status" CHECK ("ticket_sales"."status" in ('draft','open','paused','closed')),
	CONSTRAINT "ticket_sales_open_ready" CHECK ("ticket_sales"."status" <> 'open' or ("ticket_sales"."unit_price_minor" > 0 and "ticket_sales"."capacity" > 0 and "ticket_sales"."event_at" is not null and length(trim("ticket_sales"."venue")) > 0))
);
--> statement-breakpoint
ALTER TABLE "guest_tickets" ADD CONSTRAINT "guest_tickets_booking_id_ticket_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."ticket_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_tickets" ADD CONSTRAINT "guest_tickets_checked_in_by_profiles_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_sales_id_ticket_sales_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."ticket_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_payment_attempts" ADD CONSTRAINT "ticket_payment_attempts_booking_id_ticket_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."ticket_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_sales" ADD CONSTRAINT "ticket_sales_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_tickets_booking_position_idx" ON "guest_tickets" USING btree ("booking_id","position");--> statement-breakpoint
CREATE INDEX "ticket_bookings_sales_status_idx" ON "ticket_bookings" USING btree ("sales_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ticket_bookings_email_idx" ON "ticket_bookings" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ticket_attempts_pending_idx" ON "ticket_payment_attempts" USING btree ("active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_sales_one_open_idx" ON "ticket_sales" USING btree ("status") WHERE "ticket_sales"."status" = 'open';