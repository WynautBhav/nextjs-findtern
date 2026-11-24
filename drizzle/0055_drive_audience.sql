-- Hand-written. A campus drive is labelled for Tech or Non-tech students (a label only: it does not change who is eligible).
-- Existing drives read 'any' and show "Not set". Additive only, idempotent. Rollback: rollback/0055_drive_audience.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_drives" ADD COLUMN IF NOT EXISTS "audience" text NOT NULL DEFAULT 'any';
