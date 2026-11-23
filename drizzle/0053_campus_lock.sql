-- Hand-written. College virtual drives: campus lock, early exit, drive pricing on the offer, and an activity log for the TPO.
-- Additive only, idempotent. Nothing existing is rewritten: every existing join row reads 'joined', every existing offer 'standard'.
--  - college_drive_employers.status: joined | exited (the company left early) | completed (the drive ended while it was in).
--    The lock is read live against the drive's window on every request (lib/college/campus-lock.ts), so 'completed' is a record,
--    never what lifts the lock.
--  - proposals.drive_id / pricing_tier / discount_percent / ppo_fee_percent: stamped by the server when the offer is sent from a
--    drive (15% off the monthly charges, 1% full-time fee), else standard (0, 8.33). A later PPO reads them from the internship.
--  - drive_activity_logs: what each company did in a drive, for the placement officer.
-- Rollback: drizzle/rollback/0053_campus_lock.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_drive_employers" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'joined' NOT NULL;
--> statement-breakpoint
ALTER TABLE "college_drive_employers" ADD COLUMN IF NOT EXISTS "via" text DEFAULT 'link' NOT NULL;
--> statement-breakpoint
ALTER TABLE "college_drive_employers" ADD COLUMN IF NOT EXISTS "exited_at" timestamp;
--> statement-breakpoint
ALTER TABLE "college_drive_employers" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_drive_employers_employer_idx" ON "college_drive_employers" USING btree ("employer_id","status");
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "drive_id" varchar;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "pricing_tier" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "discount_percent" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "ppo_fee_percent" numeric(5,2) DEFAULT 8.33 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_drive_idx" ON "proposals" USING btree ("drive_id") WHERE "drive_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_activity_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"employer_id" varchar NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_activity_logs_drive_idx" ON "drive_activity_logs" USING btree ("drive_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_activity_logs_employer_idx" ON "drive_activity_logs" USING btree ("employer_id","drive_id","action");
