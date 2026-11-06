-- Hand-written data migration (OA9): cut every stored profile to its first 7 skills. The original arrays are copied
-- to intern_skills_backup first (rollback: drizzle/rollback/0021_skills_cut_seven.down.sql). Idempotent: a second run
-- matches no rows. Kept in its own file so it can be held back. SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intern_skills_backup" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"skills" jsonb NOT NULL,
	"extra_skills" jsonb,
	"cut_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "intern_skills_backup" ("user_id", "skills", "extra_skills")
	SELECT "user_id", "skills", "extra_data"->'skillsWithRatings' FROM "intern_onboarding"
	WHERE jsonb_typeof("skills") = 'array' AND jsonb_array_length("skills") > 7
	ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
UPDATE "intern_onboarding" o SET "skills" = (
		SELECT jsonb_agg(e ORDER BY i) FROM jsonb_array_elements(o."skills") WITH ORDINALITY t(e, i) WHERE i <= 7)
	WHERE jsonb_typeof(o."skills") = 'array' AND jsonb_array_length(o."skills") > 7;
--> statement-breakpoint
UPDATE "intern_onboarding" o SET "extra_data" = jsonb_set(o."extra_data", '{skillsWithRatings}', (
		SELECT jsonb_agg(e ORDER BY i) FROM jsonb_array_elements(o."extra_data"->'skillsWithRatings') WITH ORDINALITY t(e, i) WHERE i <= 7))
	WHERE jsonb_typeof(o."extra_data"->'skillsWithRatings') = 'array' AND jsonb_array_length(o."extra_data"->'skillsWithRatings') > 7;
