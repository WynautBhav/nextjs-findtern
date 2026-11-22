-- Hand-written. Campus drives: the companies the placement officer invited, so the drive page can say who came and who to chase.
-- Additive only, idempotent. A list of { company, email } (at most 50), checked by the API (lib/college/drive-input.ts).
-- Rollback: drizzle/rollback/0051_drive_invites.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_drives" ADD COLUMN IF NOT EXISTS "invited_employers" jsonb DEFAULT '[]'::jsonb NOT NULL;
