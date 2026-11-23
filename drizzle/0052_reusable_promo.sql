-- Hand-written. Owner, 23 Nov: for testing, a promo code can be marked reusable so one account can use it more than once.
-- Additive and idempotent. Existing usages are single-use (the default), so the one-per-account rule is unchanged for them.
-- Rollback: drizzle/rollback/0052_reusable_promo.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "reusable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "promo_code_usages" ADD COLUMN IF NOT EXISTS "single_use" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "promo_code_usages_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promo_code_usages_unique" ON "promo_code_usages" USING btree ("promo_code_id","user_id") WHERE "single_use";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promo_code_usages_order_unique" ON "promo_code_usages" USING btree ("promo_code_id","order_id") WHERE NOT "single_use";
