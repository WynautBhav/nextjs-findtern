-- Rollback of drizzle/0052_reusable_promo.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Fails if an account already used a reusable code twice; delete those extra usage rows first.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "promo_code_usages_order_unique";
DROP INDEX IF EXISTS "promo_code_usages_unique";
CREATE UNIQUE INDEX "promo_code_usages_unique" ON "promo_code_usages" USING btree ("promo_code_id","user_id");
ALTER TABLE "promo_code_usages" DROP COLUMN IF EXISTS "single_use";
ALTER TABLE "promo_codes" DROP COLUMN IF EXISTS "reusable";
DELETE FROM "_ft_migrations" WHERE "name" = '0052_reusable_promo.sql';
