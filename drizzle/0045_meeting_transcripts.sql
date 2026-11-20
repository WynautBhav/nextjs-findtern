-- Hand-written. Meetings Phase 3: Fireflies transcripts, flags and the admin review queue. ADMIN-ONLY data: no employer, intern or college route reads this table.
-- Additive only: one new table and four indexes; nothing existing is touched. Idempotent (IF NOT EXISTS).
-- One row per Fireflies transcript. `interview_id` is null while a transcript is UNMATCHED (admin bucket).
--   status          queued (webhook seen, not fetched yet / retrying) | ready (fetched, flagged) | failed (every retry used).
--   transcript      jsonb array of {i, t, s, sp} lines; nulled by the retention sweeper after 90 days (text_expires_at), with `summary`.
--   flags           jsonb array of evidence {rule, severity, snippet, offsetSec, speaker, line}; nulled after 1 year (evidence_expires_at). flags_count / max_severity stay as metadata.
--   review_state    open (flags awaiting an admin) | clean (no flags) | dismissed | warned | frozen. Only an admin click moves it past open; nothing is automatic.
--   strike_id       the account_strikes row the admin's Warn/Freeze click created (migration 0046), for traceability.
-- Retention (decided by Vaibhav): transcript text and summary 90 days; flagged evidence 1 year. The row itself (ids, counts, review outcome) stays as minimal metadata.
-- Rollback: drizzle/rollback/0045_meeting_transcripts.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fireflies_id" text NOT NULL,
	"interview_id" varchar,
	"match_method" text,
	"match_note" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"title" text,
	"started_at" timestamp,
	"duration_min" integer,
	"source_url" text,
	"summary" text,
	"transcript" jsonb,
	"flags" jsonb,
	"flags_count" integer DEFAULT 0 NOT NULL,
	"max_severity" text,
	"review_state" text DEFAULT 'clean' NOT NULL,
	"review_party" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_note" text,
	"strike_id" varchar,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"fetched_at" timestamp,
	"text_expires_at" timestamp,
	"evidence_expires_at" timestamp,
	"text_purged_at" timestamp,
	"evidence_purged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_transcripts_status_check" CHECK ("status" IN ('queued','ready','failed')),
	CONSTRAINT "meeting_transcripts_review_state_check" CHECK ("review_state" IN ('open','clean','dismissed','warned','frozen'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_transcripts_fireflies_uniq" ON "meeting_transcripts" USING btree ("fireflies_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_transcripts_interview_uniq" ON "meeting_transcripts" USING btree ("interview_id") WHERE "interview_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_transcripts_queue_idx" ON "meeting_transcripts" USING btree ("status", "next_attempt_at") WHERE "status" = 'queued';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_transcripts_review_idx" ON "meeting_transcripts" USING btree ("review_state", "received_at");
