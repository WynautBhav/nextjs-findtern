CREATE TABLE "admin_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'admin',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"country_code" text,
	"query_type" text,
	"subject" text,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" varchar NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employer_cart_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"list_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employer_google_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"scope" text,
	"token_type" text,
	"expiry_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employer_google_tokens_employer_id_unique" UNIQUE("employer_id")
);
--> statement-breakpoint
CREATE TABLE "employer_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"gateway" text DEFAULT 'razorpay' NOT NULL,
	"order_id" text NOT NULL,
	"payment_id" text,
	"signature" text,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employer_saved_searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"city" text,
	"state" text,
	"country" text,
	"job_mode" text,
	"min_experience" integer DEFAULT 0,
	"max_experience" integer DEFAULT 0,
	"min_findtern_score" integer DEFAULT 0,
	"max_findtern_score" integer DEFAULT 100,
	"include_no_experience" boolean DEFAULT true,
	"include_no_score" boolean DEFAULT true,
	"last_notified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employer_terms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_name" text NOT NULL,
	"company_email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"country_code" text DEFAULT '+91' NOT NULL,
	"phone_number" text NOT NULL,
	"password" text NOT NULL,
	"password_changed_at" timestamp DEFAULT now(),
	"agreed_to_terms" boolean DEFAULT false NOT NULL,
	"logo_url" text,
	"website_url" text,
	"company_size" text,
	"country" text,
	"city" text,
	"state" text,
	"primary_contact_name" text,
	"primary_contact_role" text,
	"escalation_contact_name" text,
	"escalation_contact_email" text,
	"escalation_contact_country_code" text,
	"escalation_contact_phone" text,
	"escalation_contact_role" text,
	"bank_name" text,
	"account_number" text,
	"account_holder_name" text,
	"ifsc_code" text,
	"swift_code" text,
	"gst_number" text,
	"international_fte_status" text DEFAULT 'none' NOT NULL,
	"international_fte_applied_at" timestamp,
	"international_fte_approved_at" timestamp,
	"setup_completed" boolean DEFAULT false NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "employers_company_email_unique" UNIQUE("company_email")
);
--> statement-breakpoint
CREATE TABLE "intern_document" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profile_photo_name" text,
	"profile_photo_type" text,
	"profile_photo_size" integer,
	"intro_video_name" text,
	"intro_video_type" text,
	"intro_video_size" integer,
	"aadhaar_image_name" text,
	"aadhaar_image_type" text,
	"aadhaar_image_size" integer,
	"pan_image_name" text,
	"pan_image_type" text,
	"pan_image_size" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intern_non_disclosure_clauses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intern_onboarding" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"linkedin_url" text,
	"pin_code" text,
	"state" text,
	"city" text,
	"aadhaar_number" text,
	"pan_number" text,
	"bio" text,
	"experience_json" jsonb DEFAULT '[]'::jsonb,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"location_types" jsonb DEFAULT '[]'::jsonb,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb,
	"has_laptop" boolean,
	"preview_summary" text,
	"extra_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intern_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intern_id" varchar NOT NULL,
	"gateway" text DEFAULT 'razorpay' NOT NULL,
	"order_id" text NOT NULL,
	"payment_id" text,
	"signature" text,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intern_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intern_id" varchar NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'bank' NOT NULL,
	"reference_id" text,
	"notes" text,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intern_terms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"project_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"slot1" timestamp,
	"slot2" timestamp,
	"slot3" timestamp,
	"selected_slot" integer,
	"timezone" text,
	"meeting_link" text,
	"calendar_event_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"dedupe_key" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pricing_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"price_hourly_minor" integer DEFAULT 0 NOT NULL,
	"per_hire_charge_minor" integer DEFAULT 0 NOT NULL,
	"internship_duration" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"gst_applicable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profile_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"project_name" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"scope_of_work" text,
	"full_time_offer" boolean DEFAULT false,
	"location_type" text,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb,
	"pincode" text,
	"city" text,
	"state" text,
	"timezone" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promo_code_usages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"order_id" varchar,
	"discount_applied_minor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"max_usages" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"min_order_amount_minor" integer,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"interview_id" varchar,
	"flow_type" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"offer_details" jsonb DEFAULT '{}'::jsonb,
	"ai_ratings" jsonb DEFAULT '{}'::jsonb,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"hired_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" varchar NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"intern_note" text,
	"manager_note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"country_code" text DEFAULT '+91' NOT NULL,
	"phone_number" text NOT NULL,
	"password" text NOT NULL,
	"agreed_to_terms" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'intern' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "website_blog_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"cover_image_url" text,
	"banner_image_url" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "website_blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "website_faqs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_featured_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"icon_class" text,
	"meta_text" text,
	"resource_count" integer DEFAULT 0 NOT NULL,
	"href" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_happy_faces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote" text NOT NULL,
	"title" text NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"avatar_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_partners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_url" text NOT NULL,
	"href" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_text" text,
	"subtitle" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_slider" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"cta_text" text,
	"cta_href" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "website_terms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "employer_cart_items_unique" ON "employer_cart_items" USING btree ("employer_id","project_id","intern_id","list_type");--> statement-breakpoint
CREATE UNIQUE INDEX "employers_country_phone_unique" ON "employers" USING btree ("country_code","phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "intern_onboarding_aadhaar_unique" ON "intern_onboarding" USING btree ("aadhaar_number");--> statement-breakpoint
CREATE UNIQUE INDEX "intern_onboarding_pan_unique" ON "intern_onboarding" USING btree ("pan_number");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_usages_unique" ON "promo_code_usages" USING btree ("promo_code_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_country_phone_unique" ON "users" USING btree ("country_code","phone_number");