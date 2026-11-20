-- Hand-written. Meetings Phase 2: the recorded pre-join gate at /meet/<token>. One row each time a participant agrees to a
-- disclaimer version for a meeting. Additive only: one new table and one index; nothing existing is touched. Idempotent (IF NOT EXISTS).
--   user_type            'intern' | 'employer'
--   disclaimer_version   the text the person agreed to (a constant in src/lib/meetings/gate.ts); a new version forces the gate again
--   ip_hash              salted HMAC of the client IP (never the raw address); null when the IP is unknown
-- The unique key makes a repeat acceptance of the same version a no-op. No foreign key, like the other meetings tables.
-- Rollback: drizzle/rollback/0044_meeting_gate_acceptances.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_gate_acceptances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" varchar NOT NULL,
	"user_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"disclaimer_version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_gate_acceptances_uniq" ON "meeting_gate_acceptances" USING btree ("interview_id", "user_type", "user_id", "disclaimer_version");
