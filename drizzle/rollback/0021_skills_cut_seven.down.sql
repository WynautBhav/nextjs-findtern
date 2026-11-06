-- Rollback of drizzle/0021_skills_cut_seven.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Puts back the full skill arrays saved before the cut. Edits a student made after the cut are overwritten
-- for backed-up rows. The backup table is dropped last, so re-applying 0021 backs up again.
SET LOCAL lock_timeout = '5s';
UPDATE "intern_onboarding" o SET "skills" = b."skills"
	FROM "intern_skills_backup" b WHERE b."onboarding_id" = o."id";
UPDATE "intern_onboarding" o SET "extra_data" = jsonb_set(o."extra_data", '{skillsWithRatings}', b."extra_skills")
	FROM "intern_skills_backup" b
	WHERE b."onboarding_id" = o."id" AND b."extra_skills" IS NOT NULL AND jsonb_typeof(o."extra_data") = 'object';
DROP TABLE IF EXISTS "intern_skills_backup";
DELETE FROM "_ft_migrations" WHERE "name" = '0021_skills_cut_seven.sql';
