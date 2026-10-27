-- Hand-written (DB-03). Legacy promo codes only ever applied to the intern
-- activation fee. 0004 added applies_to with DEFAULT 'both', which opened
-- every existing code (most are 90-100% off) to employer checkout, and codes
-- the legacy admin creates later would get 'both' too. Scope them to interns
-- and make that the default; a company code is now an explicit choice.
UPDATE "promo_codes" SET "applies_to" = 'intern' WHERE "applies_to" = 'both';--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "applies_to" SET DEFAULT 'intern';
