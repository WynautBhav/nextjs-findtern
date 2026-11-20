-- Hand-written. Account standing: strikes (warning, freeze, unfreeze) issued by a Findtern admin to an intern or an employer,
-- and the freeze itself (frozen_at / frozen_reason on users and employers). A freeze never deletes anything.
-- Additive only: one new table, three indexes and four nullable columns; nothing existing is touched. Idempotent (IF NOT EXISTS).
-- kind: warning | freeze | unfreeze | revoked. user_type: intern | employer. evidence_note is admin-only and never leaves the admin pages.
-- acknowledged_at is set when the user clicked Acknowledge on a warning (null = still waiting). flag_id is for the later meeting-review queue.
-- Numbering: 0044 and 0045 belong to other work; scripts/migrate.ts applies drizzle/*.sql in filename order and records each name, so a gap is fine.
-- Rollback: drizzle/rollback/0046_account_strikes.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_strikes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"flag_id" varchar,
	"reason" text NOT NULL,
	"evidence_note" text,
	"admin_id" varchar,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_strikes_user_idx" ON "account_strikes" USING btree ("user_type", "user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_strikes_pending_ack_idx" ON "account_strikes" USING btree ("user_type", "user_id") WHERE "kind" = 'warning' AND "acknowledged_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "frozen_reason" text;
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp;
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "frozen_reason" text;
