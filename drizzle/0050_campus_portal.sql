-- Hand-written. Campus drive portal: a placement officer can accept or deny a student, and the college's student list carries a phone number.
-- Additive only, idempotent. Nothing existing is rewritten.
--  - college_denials: "this college said no to this student". Its own table, not a status on college_memberships, because a student has
--    ONE membership row: a second college (or a later join) overwrites it, and a denial must outlive that.
--  - The trigger is the backstop for every writer of college_memberships (college code, promo code, drive code, roster link, accept):
--    no live membership of a college that denied the student. Only deleting the denial (a restore) lifts it.
--  - college_memberships.decided_*: who last accepted or restored the student, and when.
--  - college_roster.phone: the number from the officer's list, last 10 digits.
-- Rollback: drizzle/rollback/0050_campus_portal.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_memberships" ADD COLUMN IF NOT EXISTS "decided_at" timestamp;
--> statement-breakpoint
ALTER TABLE "college_memberships" ADD COLUMN IF NOT EXISTS "decided_by_type" text;
--> statement-breakpoint
ALTER TABLE "college_memberships" ADD COLUMN IF NOT EXISTS "decided_by_id" varchar;
--> statement-breakpoint
ALTER TABLE "college_roster" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_denials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"decided_by_type" text NOT NULL,
	"decided_by_id" varchar NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_denials_college_user_unique" ON "college_denials" USING btree ("college_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_denials_user_idx" ON "college_denials" USING btree ("user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION college_membership_denied_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.left_at IS NULL AND EXISTS (SELECT 1 FROM college_denials d WHERE d.college_id = NEW.college_id AND d.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'college_membership_denied' USING ERRCODE = 'P0001', HINT = 'The placement office removed this student. Only a restore can add them back.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS college_membership_denied_guard ON "college_memberships";
--> statement-breakpoint
CREATE TRIGGER college_membership_denied_guard BEFORE INSERT OR UPDATE ON "college_memberships" FOR EACH ROW EXECUTE FUNCTION college_membership_denied_guard();
