-- College partners + virtual drives. New tables only; no legacy table is altered.
CREATE TABLE "college_admins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" varchar NOT NULL,
	"action" text NOT NULL,
	"subject_user_id" varchar,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_consents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"notice_version" text NOT NULL,
	"notice_hash" text NOT NULL,
	"purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"declared_adult" boolean DEFAULT false NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "college_drive_employers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_id" varchar NOT NULL,
	"employer_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_drive_meetings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_id" varchar NOT NULL,
	"employer_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"starts_at" timestamp NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"meeting_link" text,
	"calendar_event_id" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_drive_shortlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_id" varchar NOT NULL,
	"employer_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_drives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'internship' NOT NULL,
	"description" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"include_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"verified_by" text,
	"year" integer,
	"branch" text,
	"consent_id" varchar,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "college_nudges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"admin_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_presence" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"college_id" varchar NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_roster" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" varchar NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"roll_no" text,
	"year" integer,
	"branch" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colleges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"aishe_code" text,
	"slug" text NOT NULL,
	"email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logo_url" text,
	"is_partner" boolean DEFAULT false NOT NULL,
	"show_on_website" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "college_admins_email_unique" ON "college_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "college_audit_log_college_idx" ON "college_audit_log" USING btree ("college_id","created_at");--> statement-breakpoint
CREATE INDEX "college_consents_user_idx" ON "college_consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "college_drive_employers_unique" ON "college_drive_employers" USING btree ("drive_id","employer_id");--> statement-breakpoint
CREATE INDEX "college_drive_meetings_user_idx" ON "college_drive_meetings" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "college_drive_meetings_drive_idx" ON "college_drive_meetings" USING btree ("drive_id");--> statement-breakpoint
CREATE UNIQUE INDEX "college_drive_shortlist_unique" ON "college_drive_shortlist" USING btree ("drive_id","employer_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "college_drives_token_unique" ON "college_drives" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "college_drives_college_idx" ON "college_drives" USING btree ("college_id");--> statement-breakpoint
CREATE UNIQUE INDEX "college_memberships_user_unique" ON "college_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "college_memberships_college_idx" ON "college_memberships" USING btree ("college_id");--> statement-breakpoint
CREATE INDEX "college_nudges_user_idx" ON "college_nudges" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "college_presence_college_idx" ON "college_presence" USING btree ("college_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "college_roster_college_email_unique" ON "college_roster" USING btree ("college_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "colleges_slug_unique" ON "colleges" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "colleges_aishe_unique" ON "colleges" USING btree ("aishe_code") WHERE "colleges"."aishe_code" is not null;--> statement-breakpoint
CREATE INDEX "colleges_name_idx" ON "colleges" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");