-- Hand-written. Per-student drive codes and entitlements. Only the hash and last 4 of a code are stored. No FKs. Idempotent.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"entry_id" varchar NOT NULL,
	"code_hash" text NOT NULL,
	"code_last4" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "drive_codes_status_check" CHECK ("status" IN ('issued','redeemed','revoked','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_codes_entry_uq" ON "drive_codes" USING btree ("entry_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_codes_hash_uq" ON "drive_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_codes_order_idx" ON "drive_codes" USING btree ("order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_entitlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"payment_id" varchar,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interview_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_entitlements_code_uq" ON "drive_entitlements" USING btree ("code_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_entitlements_order_intern_uq" ON "drive_entitlements" USING btree ("order_id","intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_entitlements_intern_idx" ON "drive_entitlements" USING btree ("intern_id");
