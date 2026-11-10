-- Hand-written. Indexes for the lookups the dashboards and lists run on every request, which had none and so read the
-- whole table (measured on a scratch DB with 300k notifications / 150k proposals: 9-14 ms seq scans per query, repeated
-- 10-60 times per page). Chosen from the WHERE/JOIN columns actually used in src/, not every unindexed *_id column.
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction; lock_timeout makes it give up
-- rather than queue behind a long write. IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0028_hot_path_indexes.down.sql (indexes only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" ("recipient_id", "recipient_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_employer_id_idx" ON "proposals" ("employer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_project_id_idx" ON "proposals" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_employer_id_idx" ON "projects" ("employer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_employer_id_idx" ON "interviews" ("employer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employer_payments_employer_id_idx" ON "employer_payments" ("employer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timesheets_proposal_id_idx" ON "timesheets" ("proposal_id");
