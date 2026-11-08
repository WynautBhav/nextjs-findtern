-- Hand-written. Candidate control over employer-visible presence. Employers see online / last seen BY DEFAULT;
-- a student can hide it from their settings. "show_activity" lives on user_presence, the table the heartbeat and
-- the messaging code already key by user. Existing rows and users with no row yet count as visible (DEFAULT TRUE).
-- The server enforces it on every employer-facing read (src/lib/presence.ts); heartbeats keep recording either way.
-- Additive only, idempotent (IF NOT EXISTS). Rollback: drizzle/rollback/0027_presence_visibility.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "user_presence" ADD COLUMN IF NOT EXISTS "show_activity" boolean DEFAULT true NOT NULL;
