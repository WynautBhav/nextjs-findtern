-- Hand-written. Drive roster import + identity review. No FKs (matches the rest of the drive tables). Idempotent.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"file_sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"mapping" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"status" text NOT NULL DEFAULT 'preview',
	"counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "drive_imports_status_check" CHECK ("status" IN ('preview','confirmed','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_imports_order_file_uq" ON "drive_imports" USING btree ("order_id","file_sha256") WHERE "status" <> 'void';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_roster_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"import_id" varchar NOT NULL,
	"row_no" integer NOT NULL,
	"name" text NOT NULL,
	"college_email_norm" text NOT NULL,
	"phone_e164" text,
	"state" text NOT NULL,
	"reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"match" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"intern_id" varchar,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "drive_roster_entries_state_check" CHECK ("state" IN ('valid','invalid','duplicate','ambiguous','over_allocation'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_roster_entries_order_email_uq" ON "drive_roster_entries" USING btree ("order_id","college_email_norm");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_roster_entries_import_idx" ON "drive_roster_entries" USING btree ("import_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"entry_id" varchar NOT NULL,
	"candidate_intern_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"decided_by" varchar,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "identity_reviews_status_check" CHECK ("status" IN ('pending','linked','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identity_reviews_entry_candidate_uq" ON "identity_reviews" USING btree ("entry_id","candidate_intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_reviews_order_status_idx" ON "identity_reviews" USING btree ("order_id","status");
