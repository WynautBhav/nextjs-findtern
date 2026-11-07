-- Hand-written. Admin roster uploads (idempotent by file hash), ported from integrate/employer-1107 0019 onto master's
-- schema. Only this table: integrate's colleges.contact_*, college_roster match columns and payment_refunds are NOT
-- ported (master has identity_reviews in 0019 and its own payment_refunds in 0022).
-- Retention: "rows" holds the whole uploaded file (names, emails, phones), so every import gets "expires_at"
-- (default 30 days). A purge job deletes or blanks expired rows; the unique file index then lets the same file be
-- re-uploaded. mapping: {name:int, email:int, phone:int|null}. status: previewed|committed|discarded.
-- Idempotent (IF NOT EXISTS). Rollback: drizzle/rollback/0026_college_roster_imports.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
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
	"committed_at" timestamp,
	"expires_at" timestamp DEFAULT now() + interval '30 days' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_roster_imports_file_uniq" ON "college_roster_imports" USING btree ("college_id", "file_sha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_roster_imports_expires_idx" ON "college_roster_imports" USING btree ("expires_at");
