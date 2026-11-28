-- Hand-written. Master data follow-ups become Call 1 / Call 2 ticks (owner, 28 Nov); the Nudge mark is derived from admin
-- nudges (notifications type 'nudge') and is never stored. admin_follow_ups stays a log: each tick or undo inserts one row,
-- the newest row per call wins. Only the status CHECK changes; the old statuses had 0 rows on staging and local.
-- Idempotent (drop if exists, then add). Rollback: rollback/0058_follow_up_calls.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "admin_follow_ups" DROP CONSTRAINT IF EXISTS "admin_follow_ups_status_chk";
--> statement-breakpoint
ALTER TABLE "admin_follow_ups" ADD CONSTRAINT "admin_follow_ups_status_chk" CHECK ("status" IN ('call_1', 'call_2', 'call_1_undone', 'call_2_undone'));
