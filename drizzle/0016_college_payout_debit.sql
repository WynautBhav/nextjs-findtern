-- Hand-written. A college payout debit (kind 'payout') in college_wallet_entries must name its college_payouts row,
-- and one request can be debited only once. Idempotent: ADD COLUMN / CREATE INDEX IF NOT EXISTS; the CHECK is
-- DROP IF EXISTS then ADD, as in 0014 (NOT VALID then VALIDATE keeps the ADD cheap and fails loudly on a bad row).
-- SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" ADD COLUMN IF NOT EXISTS "payout_id" varchar;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_wallet_payout_unique" ON "college_wallet_entries" USING btree ("payout_id") WHERE "kind" = 'payout';
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" DROP CONSTRAINT IF EXISTS "college_wallet_payout_has_id";
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" ADD CONSTRAINT "college_wallet_payout_has_id" CHECK ("kind" <> 'payout' OR "payout_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" VALIDATE CONSTRAINT "college_wallet_payout_has_id";
