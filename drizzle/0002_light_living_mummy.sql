CREATE TABLE "admin_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" varchar,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "billing_pincode" text;--> statement-breakpoint
ALTER TABLE "pricing_plans" ADD COLUMN "feature_list" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_plans" ADD COLUMN "compare_at_hourly_minor" integer;--> statement-breakpoint
ALTER TABLE "pricing_plans" ADD COLUMN "compare_at_per_hire_minor" integer;--> statement-breakpoint
ALTER TABLE "pricing_plans" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
-- Backfill (hand-written): the featured plan and the seeded strikethrough prices.
-- Admins change these from /admin/settings; null compare-at hides the strikethrough.
UPDATE "pricing_plans" SET "is_featured" = true WHERE lower("slug") = 'cappuccino' AND upper("currency") = 'INR';--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_hourly_minor" = 15000 WHERE lower("slug") = 'cappuccino' AND upper("currency") = 'INR';--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_hourly_minor" = 30000 WHERE lower("slug") = 'latte' AND upper("currency") = 'INR';--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_per_hire_minor" = 750000 WHERE lower("slug") = 'espresso' AND upper("currency") = 'INR';
