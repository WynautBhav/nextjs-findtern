-- Hand-written. Master data follow-ups: a log of what an admin did to chase a student, employer or college. The newest row
-- for a target is its current status and note; older rows are its history (drawer). Rows are only inserted, never updated.
-- target_type: student | employer | college. status: pending | followed_up | responded | no_response | escalated. note <= 2000.
-- Additive only: one new table and one index, nothing existing is touched. Idempotent. Rollback: rollback/0057_admin_follow_ups.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_follow_ups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"admin_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_follow_ups_target_type_chk" CHECK ("target_type" IN ('student', 'employer', 'college')),
	CONSTRAINT "admin_follow_ups_status_chk" CHECK ("status" IN ('pending', 'followed_up', 'responded', 'no_response', 'escalated')),
	CONSTRAINT "admin_follow_ups_note_len_chk" CHECK ("note" IS NULL OR char_length("note") <= 2000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_follow_ups_target_idx" ON "admin_follow_ups" USING btree ("target_type", "target_id", "created_at");
