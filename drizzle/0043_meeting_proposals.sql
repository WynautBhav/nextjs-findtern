-- Hand-written. Meetings both ways (Phase 1): either side offers up to three times, the other picks one or counters.
-- Additive only: six nullable/defaulted columns on interviews and one unique index. Idempotent (IF NOT EXISTS).
--   proposed_by   who made the standing offer: 'employer' (every existing row) | 'intern'. The OTHER side may pick or counter.
--   round         1 = first offer; a counter-offer is round + 1 and flips proposed_by (max 3, enforced in app code).
--   respond_by    when the standing offer lapses (earliest slot minus 2 h); null on legacy rows = they expire by slot time.
--   cancelled_by / cancel_reason   'employer' | 'intern' | 'system', and the reason the person gave.
--   gate_token    opaque id for /meet/<token>; emails and invites carry it instead of the Meet URL. Unique when set.
-- An intern's meeting request is an interviews row with proposed_by = 'intern' (no separate table).
-- Rollback: drizzle/rollback/0043_meeting_proposals.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "proposed_by" text DEFAULT 'employer' NOT NULL;
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "round" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "respond_by" timestamp;
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "cancelled_by" text;
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "cancel_reason" text;
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "gate_token" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interviews_gate_token_uniq" ON "interviews" USING btree ("gate_token") WHERE "gate_token" IS NOT NULL;
