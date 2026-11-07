-- Hand-written. Drive orders: the single paid unit for a college drive (slots x per-student fee).
-- credit_minor is a signed line on the order (carried-over seat credit); old money rows are never edited.
-- Idempotent.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_drive_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"drive_id" varchar,
	"slots" integer NOT NULL,
	"fee_per_student_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"credit_minor" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"seat_batch_id" varchar,
	"issued_count" integer DEFAULT 0 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"code_valid_until" timestamp,
	"paid_at" timestamp,
	"verified_by" varchar,
	"gateway_ref" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "college_drive_orders_slots_pos" CHECK ("slots" > 0),
	CONSTRAINT "college_drive_orders_fee_pos" CHECK ("fee_per_student_minor" > 0),
	CONSTRAINT "college_drive_orders_amount_eq" CHECK ("amount_minor" = "slots" * "fee_per_student_minor"),
	CONSTRAINT "college_drive_orders_credit_nonneg" CHECK ("credit_minor" >= 0),
	CONSTRAINT "college_drive_orders_payable_nonneg" CHECK ("amount_minor" - "credit_minor" >= 0),
	CONSTRAINT "college_drive_orders_status_valid" CHECK ("status" IN ('pending','paid','failed','refunded','partially_refunded')),
	CONSTRAINT "college_drive_orders_counts_valid" CHECK ("issued_count" >= 0 AND "redeemed_count" >= 0 AND "issued_count" <= "slots" AND "redeemed_count" <= "issued_count")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_drive_orders_college_idx" ON "college_drive_orders" USING btree ("college_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_drive_orders_drive_unique" ON "college_drive_orders" USING btree ("drive_id") WHERE "drive_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_drive_orders_batch_unique" ON "college_drive_orders" USING btree ("seat_batch_id") WHERE "seat_batch_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "college_seat_batches" ADD COLUMN IF NOT EXISTS "drive_order_id" varchar;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_seat_batches_drive_order_unique" ON "college_seat_batches" USING btree ("drive_order_id") WHERE "drive_order_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "college_drives" ADD COLUMN IF NOT EXISTS "order_id" varchar;
