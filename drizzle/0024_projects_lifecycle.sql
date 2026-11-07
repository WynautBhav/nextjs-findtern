-- Hand-written. Employer project lifecycle (WP-B). Idempotent.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
--> statement-breakpoint
-- Allows legacy and new values. Added NOT VALID so existing rows are not scanned here; new writes are checked
-- at once. It is validated after the backfill below.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check') THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check"
      CHECK ("status" IS NULL OR "status" IN ('active','inactive','archived','closed','draft','pending_review','published','paused','rejected')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
-- Backfill (WAVE 2). Idempotent: each UPDATE only touches legacy values, so a re-run is a no-op.
-- The CHECK already allows legacy and new values; validation is the last step and cannot fail the file.
UPDATE "projects" SET "status" = 'published', "published_at" = COALESCE("published_at", "created_at") WHERE "status" = 'active';
--> statement-breakpoint
UPDATE "projects" SET "status" = 'paused' WHERE "status" = 'inactive';
--> statement-breakpoint
UPDATE "projects" SET "status" = 'closed' WHERE "status" = 'archived';
--> statement-breakpoint
-- A row with an unknown legacy value must not roll back this whole file (migrate.ts runs it in one transaction)
-- and block every later migration: on a violation the constraint stays NOT VALID and a notice is raised.
DO $$ BEGIN
  BEGIN
    ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_status_check";
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'projects_status_check left NOT VALID: some projects.status values are unknown; fix them and validate by hand';
  END;
END $$;
