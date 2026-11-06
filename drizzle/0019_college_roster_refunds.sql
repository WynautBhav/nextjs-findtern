-- Hand-written. College contacts, roster phone + match state (OA5), roster imports (idempotent by file hash) and
-- payment refunds (OA6). New columns are nullable or defaulted; no FK to legacy tables; no CHECK on legacy tables.
-- Idempotent (IF NOT EXISTS). SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "colleges" ADD COLUMN IF NOT EXISTS "contact_name" text,
	ADD COLUMN IF NOT EXISTS "contact_email" text,
	ADD COLUMN IF NOT EXISTS "contact_phone" text,
	ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
-- phone: normalised 10-digit Indian mobile or E.164. match_status: unmatched|email|review|linked|rejected.
-- match_candidates: [{userId, reason:'phone'|'name'}] for the review queue.
ALTER TABLE "college_roster" ADD COLUMN IF NOT EXISTS "phone" text,
	ADD COLUMN IF NOT EXISTS "import_id" varchar,
	ADD COLUMN IF NOT EXISTS "matched_user_id" varchar,
	ADD COLUMN IF NOT EXISTS "match_status" text DEFAULT 'unmatched' NOT NULL,
	ADD COLUMN IF NOT EXISTS "match_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	ADD COLUMN IF NOT EXISTS "match_decided_by" varchar,
	ADD COLUMN IF NOT EXISTS "match_decided_at" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_roster_matched_user_uniq" ON "college_roster" USING btree ("college_id", "matched_user_id") WHERE "matched_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_roster_review_idx" ON "college_roster" USING btree ("match_status") WHERE "match_status" = 'review';
--> statement-breakpoint
-- mapping: {name:int, email:int, phone:int|null}. rows: classified preview rows. status: previewed|committed|discarded.
CREATE TABLE IF NOT EXISTS "college_roster_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"status" text DEFAULT 'previewed' NOT NULL,
	"over_allocation" boolean DEFAULT false NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_roster_imports_file_uniq" ON "college_roster_imports" USING btree ("college_id", "file_sha256");
--> statement-breakpoint
-- review_reason: interview_taken|not_gateway|... gateway: copied from intern_payments.gateway.
-- seat_usage_id: promo_code_usages.id claimed for this refund.
CREATE TABLE IF NOT EXISTS "payment_refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intern_payment_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"roster_id" varchar,
	"amount_minor" integer NOT NULL CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount_minor" > 0),
	"status" text NOT NULL CONSTRAINT "payment_refunds_status_check" CHECK ("status" IN ('eligible','requires_review','pending','initiated','refunded','failed','rejected')),
	"review_reason" text,
	"gateway" text NOT NULL,
	"gateway_refund_id" text,
	"gateway_status" text,
	"gateway_response" jsonb,
	"last_error" text,
	"manual_reference" text,
	"seat_usage_id" varchar,
	"initiated_by" varchar,
	"initiated_at" timestamp,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_live_uniq" ON "payment_refunds" USING btree ("intern_payment_id") WHERE "status" NOT IN ('failed','rejected');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_gateway_uniq" ON "payment_refunds" USING btree ("gateway_refund_id") WHERE "gateway_refund_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_refunds_status_idx" ON "payment_refunds" USING btree ("status", "created_at");
