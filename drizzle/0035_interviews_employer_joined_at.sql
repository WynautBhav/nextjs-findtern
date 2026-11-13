-- Hand-written (db:generate drifts against the 0005 snapshot and re-emits unrelated CREATE TABLEs; only its interviews statement is kept).
-- interviews.employer_joined_at: the first time the employer pressed Join in the app. Nullable, no default, no backfill:
-- legacy rows stay null and are exempt from the employer-no-show rule (see NO_SHOW_RULE_FROM in employer-interview-rules.ts).
-- ADD COLUMN of a nullable column without a default is metadata-only in Postgres, so it takes no table rewrite.
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0035_interviews_employer_joined_at.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "employer_joined_at" timestamp;
