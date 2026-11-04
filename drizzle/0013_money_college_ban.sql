-- Hand-written. Wave 2 money + ban: all additive, nullable or defaulted, no backfill. IF NOT EXISTS: safe to re-run.
-- SET LOCAL: scoped to the runner's transaction. Campus-hire columns are deliberately absent (rev 2).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "college_id" varchar;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_college_id_unique" ON "promo_codes" ("college_id") WHERE "college_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_at" timestamp, ADD COLUMN IF NOT EXISTS "ban_reason" text, ADD COLUMN IF NOT EXISTS "banned_by" varchar;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "ended_at" timestamp, ADD COLUMN IF NOT EXISTS "ended_reason" text;
--> statement-breakpoint
ALTER TABLE "intern_payouts" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'stipend', ADD COLUMN IF NOT EXISTS "bonus_proposal_id" varchar;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intern_payouts_bonus_proposal_unique" ON "intern_payouts" ("bonus_proposal_id") WHERE "kind" = 'completion_bonus';
--> statement-breakpoint
ALTER TABLE "colleges" ADD COLUMN IF NOT EXISTS "gstin" text, ADD COLUMN IF NOT EXISTS "bank_account_name" text, ADD COLUMN IF NOT EXISTS "bank_name" text, ADD COLUMN IF NOT EXISTS "bank_account_number" text, ADD COLUMN IF NOT EXISTS "bank_ifsc" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_seat_batches" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "college_id" varchar NOT NULL,
  "seats" integer NOT NULL,
  "unit_price_minor" integer NOT NULL DEFAULT 80000,
  "amount_minor" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "method" text,
  "reference_id" text,
  "invoice_number" text,
  "paid_at" timestamp,
  "created_by" varchar,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_seat_batches_invoice_unique" ON "college_seat_batches" ("invoice_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_seat_batches_college_idx" ON "college_seat_batches" ("college_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_wallet_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "college_id" varchar NOT NULL,
  "kind" text NOT NULL,
  "amount_minor" integer NOT NULL,
  "proposal_id" varchar,
  "intern_id" varchar,
  "band_id" text,
  "created_by" varchar,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_wallet_incentive_unique" ON "college_wallet_entries" ("proposal_id") WHERE "kind" = 'incentive';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_wallet_entries_college_idx" ON "college_wallet_entries" ("college_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_payouts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "college_id" varchar NOT NULL,
  "amount_minor" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'requested',
  "requested_by" varchar,
  "reference_id" text,
  "paid_at" timestamp,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_payouts_open_unique" ON "college_payouts" ("college_id") WHERE "status" = 'requested';
