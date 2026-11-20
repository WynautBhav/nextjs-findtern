-- Hand-written. Frozen intern with a running paid hire: an admin may let them keep working (timesheets, stipend view, notifications only).
-- Additive only: four nullable columns on users, nothing existing is touched. Idempotent (IF NOT EXISTS).
-- work_exempt_at / work_exempt_by: the grant (null = fully frozen, the default). work_decision_at: an admin decided either way, so the
-- "decide" alert is closed. work_review_notified_at: the admin alert for this freeze went out (once only). All four are cleared on unfreeze.
-- Numbering: 0044 and 0045 belong to other work; scripts/migrate.ts applies drizzle/*.sql in filename order, so a gap is fine.
-- Rollback: drizzle/rollback/0047_work_exempt.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_exempt_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_exempt_by" varchar;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_decision_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_review_notified_at" timestamp;
