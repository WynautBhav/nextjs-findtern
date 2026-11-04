-- Hand-written. The Candidates list and export look up interviews, proposals and intern_payments by intern_id once per row
-- (correlated subqueries); with no index each lookup was a full table scan. Plain CREATE INDEX (not CONCURRENTLY): the runner
-- wraps each file in a transaction, and these tables are small. IF NOT EXISTS: safe to re-run. SET LOCAL: scoped to this transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_intern_id_idx" ON "interviews" ("intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_intern_id_idx" ON "proposals" ("intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_payments_intern_id_idx" ON "intern_payments" ("intern_id");
