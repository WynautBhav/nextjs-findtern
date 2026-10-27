import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
// --------------------------------------------------
// User (Intern) Schema
// --------------------------------------------------
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  countryCode: text("country_code").notNull().default("+91"),
  phoneNumber: text("phone_number").notNull(),
  password: text("password").notNull(),
  agreedToTerms: boolean("agreed_to_terms").notNull().default(false),
  // intern | employee
  role: text("role").notNull().default("intern"),
  // Admin-controlled marketplace visibility. `live` interns appear in the
  // public directory and employer search; `hidden` keeps the account active
  // but removes it from discovery without deleting anything.
  profileVisibility: text("profile_visibility").notNull().default("live"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  usersCountryPhoneUnique: uniqueIndex("users_country_phone_unique").on(t.countryCode, t.phoneNumber),
  usersCreatedAtIdx: index("users_created_at_idx").on(t.createdAt),
  usersVisibilityIdx: index("users_profile_visibility_idx").on(t.profileVisibility),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(),
  subjectId: varchar("subject_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailOtps = pgTable("email_otps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(),
  subjectId: varchar("subject_id").notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type EmailOtp = typeof emailOtps.$inferSelect;
export type InsertEmailOtp = typeof emailOtps.$inferInsert;

// --------------------------------------------------
// Employer / Company Schema
// --------------------------------------------------
export const employers = pgTable("employers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  companyName: text("company_name").notNull(),
  companyEmail: text("company_email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  countryCode: text("country_code").notNull().default("+91"),
  phoneNumber: text("phone_number").notNull(),
  password: text("password").notNull(),
  passwordChangedAt: timestamp("password_changed_at").defaultNow(),
  agreedToTerms: boolean("agreed_to_terms").notNull().default(false),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  companySize: text("company_size"),
  country: text("country"),
  city: text("city"),
  state: text("state"),
  /** Billing PIN code; decides the GST place of supply (CGST+SGST vs IGST). */
  billingPincode: text("billing_pincode"),
  primaryContactName: text("primary_contact_name"),
  primaryContactRole: text("primary_contact_role"),
  escalationContactName: text("escalation_contact_name"),
  escalationContactEmail: text("escalation_contact_email"),
  escalationContactCountryCode: text("escalation_contact_country_code"),
  escalationContactPhone: text("escalation_contact_phone"),
  escalationContactRole: text("escalation_contact_role"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountHolderName: text("account_holder_name"),
  ifscCode: text("ifsc_code"),
  swiftCode: text("swift_code"),
  gstNumber: text("gst_number"),
  internationalFteStatus: text("international_fte_status").notNull().default("none"),
  internationalFteAppliedAt: timestamp("international_fte_applied_at"),
  internationalFteApprovedAt: timestamp("international_fte_approved_at"),
  setupCompleted: boolean("setup_completed").notNull().default(false),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  employersCountryPhoneUnique: uniqueIndex("employers_country_phone_unique").on(t.countryCode, t.phoneNumber),
}));

export type Employer = typeof employers.$inferSelect;

// --------------------------------------------------
// Admin Roles (RBAC)
// --------------------------------------------------

export const adminRoles = pgTable("admin_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AdminRole = typeof adminRoles.$inferSelect;
export type InsertAdminRole = typeof adminRoles.$inferInsert;

// --------------------------------------------------
// Admin Schema (for /admin/login)
// --------------------------------------------------
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  role: text("role").default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Admin = typeof admins.$inferSelect;

// --------------------------------------------------
// Website CMS
// --------------------------------------------------

export const websiteSlider = pgTable("website_slider", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url"),
  ctaText: text("cta_text"),
  ctaHref: text("cta_href"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteSliderItem = typeof websiteSlider.$inferSelect;
export type InsertWebsiteSliderItem = typeof websiteSlider.$inferInsert;

export const websiteBlogPosts = pgTable("website_blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  coverImageUrl: text("cover_image_url"),
  bannerImageUrl: text("banner_image_url"),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteBlogPost = typeof websiteBlogPosts.$inferSelect;
export type InsertWebsiteBlogPost = typeof websiteBlogPosts.$inferInsert;

export const websiteFeaturedSkills = pgTable("website_featured_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  iconClass: text("icon_class"),
  metaText: text("meta_text"),
  resourceCount: integer("resource_count").notNull().default(0),
  href: text("href"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteFeaturedSkill = typeof websiteFeaturedSkills.$inferSelect;
export type InsertWebsiteFeaturedSkill = typeof websiteFeaturedSkills.$inferInsert;

export const websiteHappyFaces = pgTable("website_happy_faces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quote: text("quote").notNull(),
  title: text("title").notNull(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  avatarUrl: text("avatar_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteHappyFace = typeof websiteHappyFaces.$inferSelect;
export type InsertWebsiteHappyFace = typeof websiteHappyFaces.$inferInsert;

export const websitePartners = pgTable("website_partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull(),
  href: text("href"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsitePartner = typeof websitePartners.$inferSelect;
export type InsertWebsitePartner = typeof websitePartners.$inferInsert;

export const websitePlans = pgTable("website_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  priceText: text("price_text"),
  subtitle: text("subtitle"),
  features: jsonb("features").$type<string[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsitePlan = typeof websitePlans.$inferSelect;
export type InsertWebsitePlan = typeof websitePlans.$inferInsert;

// --------------------------------------------------
// Pricing Plans (Admin editable, region-aware)
// --------------------------------------------------
export const pricingPlans = pgTable("pricing_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  region: text("region"), // null = global, 'IN' = India specific
  currency: text("currency").notNull().default("INR"),
  priceHourlyMinor: integer("price_hourly_minor").notNull().default(0), // stored in minor units (paise/cents)
  perHireChargeMinor: integer("per_hire_charge_minor").notNull().default(0),
  internshipDuration: text("internship_duration"),
  features: jsonb("features").$type<string[]>().default([]),
  /** The ✓ / ✗ list shown on the plan card. Separate from `features`, whose
   *  three positional entries drive the comparison table rows. */
  featureList: jsonb("feature_list").$type<{ label: string; included: boolean }[]>().notNull().default([]),
  /** Struck-through "was" prices. Null means no strikethrough is shown. */
  compareAtHourlyMinor: integer("compare_at_hourly_minor"),
  compareAtPerHireMinor: integer("compare_at_per_hire_minor"),
  isFeatured: boolean("is_featured").notNull().default(false),
  gstApplicable: boolean("gst_applicable").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PricingPlan = typeof pricingPlans.$inferSelect;
export type InsertPricingPlan = typeof pricingPlans.$inferInsert;

/** Admin-editable platform values (fees, toggles). One row per key. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;

/** Sensitive admin actions (impersonation, contact edits), append-only. */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  adminAuditLogCreatedIdx: index("admin_audit_log_created_idx").on(t.createdAt),
}));

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

export const websiteFaqs = pgTable("website_faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteFaq = typeof websiteFaqs.$inferSelect;
export type InsertWebsiteFaq = typeof websiteFaqs.$inferInsert;

export const websiteTerms = pgTable("website_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebsiteTerms = typeof websiteTerms.$inferSelect;
export type InsertWebsiteTerms = typeof websiteTerms.$inferInsert;

export const internTerms = pgTable("intern_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InternTerms = typeof internTerms.$inferSelect;
export type InsertInternTerms = typeof internTerms.$inferInsert;

export const internNonDisclosureClauses = pgTable("intern_non_disclosure_clauses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InternNonDisclosureClause = typeof internNonDisclosureClauses.$inferSelect;
export type InsertInternNonDisclosureClause = typeof internNonDisclosureClauses.$inferInsert;

export const employerTerms = pgTable("employer_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmployerTerms = typeof employerTerms.$inferSelect;
export type InsertEmployerTerms = typeof employerTerms.$inferInsert;

export const contactMessages = pgTable("contact_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  countryCode: text("country_code"),
  queryType: text("query_type"),
  subject: text("subject"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

// --------------------------------------------------
// Google OAuth Tokens (Employer Calendar / Meet)
// --------------------------------------------------
export const employerGoogleTokens = pgTable("employer_google_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull().unique(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  scope: text("scope"),
  tokenType: text("token_type"),
  expiryDate: timestamp("expiry_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmployerGoogleToken = typeof employerGoogleTokens.$inferSelect;
// Projects Schema
// --------------------------------------------------
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  projectName: text("project_name").notNull(),
  skills: jsonb("skills").$type<string[]>().default([]),
  scopeOfWork: text("scope_of_work"),
  fullTimeOffer: boolean("full_time_offer").default(false),
  locationType: text("location_type"), // onsite, hybrid, remote
  preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
  pincode: text("pincode"),
  city: text("city"),
  state: text("state"),
  timezone: text("timezone"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Project = typeof projects.$inferSelect;

export const countryCodes = [
  { code: "+91", country: "IN", flag: "IN" },
  { code: "+1", country: "US", flag: "US" },
  { code: "+44", country: "UK", flag: "GB" },
  { code: "+61", country: "AU", flag: "AU" },
  { code: "+49", country: "DE", flag: "DE" },
  { code: "+33", country: "FR", flag: "FR" },
  { code: "+81", country: "JP", flag: "JP" },
  { code: "+86", country: "CN", flag: "CN" },
  { code: "+65", country: "SG", flag: "SG" },
  { code: "+971", country: "AE", flag: "AE" },
] as const;

export const companySizes = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
] as const;

// Sheet row 60: three options. Older rows may still hold "short-term",
// "medium-term", "long-term" or "not-sure" - `scopeLabel` reads those too.
export const scopeOfWorkOptions = [
  { value: "upto-60", label: "Up to 60 days" },
  { value: "upto-90", label: "Up to 90 days" },
  { value: "upto-180", label: "Up to 180 days" },
] as const;

const LEGACY_SCOPE_LABEL: Record<string, string> = {
  "short-term": "Up to 60 days",
  "medium-term": "Up to 90 days",
  "long-term": "Up to 180 days",
  "not-sure": "Not decided",
  "Short-term": "Up to 90 days",
  "Long-term": "Up to 180 days",
};

/** Display label for any stored scope value, current or legacy. */
export function scopeLabel(value: string | null | undefined): string {
  if (!value) return "Not set";
  return scopeOfWorkOptions.find((o) => o.value === value)?.label ?? LEGACY_SCOPE_LABEL[value] ?? value;
}

export const timezones = [
  // UTC / Global
  { value: "UTC", label: "UTC" },
  { value: "Etc/UTC", label: "Etc/UTC" },
  { value: "Etc/GMT", label: "Etc/GMT" },

  // Asia (India + nearby)
  { value: "Asia/Kolkata", label: "Asia/Kolkata (Recommended for India)" },
  { value: "Asia/Karachi", label: "Asia/Karachi" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka" },
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu" },
  { value: "Asia/Colombo", label: "Asia/Colombo" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Muscat", label: "Asia/Muscat" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh" },
  { value: "Asia/Qatar", label: "Asia/Qatar" },
  { value: "Asia/Kuwait", label: "Asia/Kuwait" },
  { value: "Asia/Tehran", label: "Asia/Tehran" },
  { value: "Asia/Baghdad", label: "Asia/Baghdad" },
  { value: "Asia/Jerusalem", label: "Asia/Jerusalem" },
  { value: "Asia/Amman", label: "Asia/Amman" },
  { value: "Asia/Beirut", label: "Asia/Beirut" },
  { value: "Asia/Damascus", label: "Asia/Damascus" },
  { value: "Asia/Istanbul", label: "Asia/Istanbul" },
  { value: "Asia/Tbilisi", label: "Asia/Tbilisi" },
  { value: "Asia/Yerevan", label: "Asia/Yerevan" },
  { value: "Asia/Baku", label: "Asia/Baku" },
  { value: "Asia/Kabul", label: "Asia/Kabul" },
  { value: "Asia/Tashkent", label: "Asia/Tashkent" },
  { value: "Asia/Almaty", label: "Asia/Almaty" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Seoul", label: "Asia/Seoul" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong" },
  { value: "Asia/Taipei", label: "Asia/Taipei" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok" },
  { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh" },
  { value: "Asia/Manila", label: "Asia/Manila" },

  // Europe
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Rome", label: "Europe/Rome" },
  { value: "Europe/Madrid", label: "Europe/Madrid" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam" },
  { value: "Europe/Brussels", label: "Europe/Brussels" },
  { value: "Europe/Vienna", label: "Europe/Vienna" },
  { value: "Europe/Zurich", label: "Europe/Zurich" },
  { value: "Europe/Stockholm", label: "Europe/Stockholm" },
  { value: "Europe/Oslo", label: "Europe/Oslo" },
  { value: "Europe/Copenhagen", label: "Europe/Copenhagen" },
  { value: "Europe/Helsinki", label: "Europe/Helsinki" },
  { value: "Europe/Warsaw", label: "Europe/Warsaw" },
  { value: "Europe/Prague", label: "Europe/Prague" },
  { value: "Europe/Budapest", label: "Europe/Budapest" },
  { value: "Europe/Athens", label: "Europe/Athens" },
  { value: "Europe/Bucharest", label: "Europe/Bucharest" },
  { value: "Europe/Sofia", label: "Europe/Sofia" },
  { value: "Europe/Kiev", label: "Europe/Kiev" },
  { value: "Europe/Moscow", label: "Europe/Moscow" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon" },
  { value: "Europe/Dublin", label: "Europe/Dublin" },
  { value: "Europe/Reykjavik", label: "Europe/Reykjavik" },

  // America
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Denver", label: "America/Denver" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "America/Phoenix", label: "America/Phoenix" },
  { value: "America/Anchorage", label: "America/Anchorage" },
  { value: "America/Toronto", label: "America/Toronto" },
  { value: "America/Vancouver", label: "America/Vancouver" },
  { value: "America/Mexico_City", label: "America/Mexico_City" },
  { value: "America/Bogota", label: "America/Bogota" },
  { value: "America/Lima", label: "America/Lima" },
  { value: "America/Santiago", label: "America/Santiago" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { value: "America/Havana", label: "America/Havana" },
  { value: "America/Panama", label: "America/Panama" },
  { value: "America/Jamaica", label: "America/Jamaica" },

  // Australia & Pacific
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "Australia/Melbourne", label: "Australia/Melbourne" },
  { value: "Australia/Brisbane", label: "Australia/Brisbane" },
  { value: "Australia/Perth", label: "Australia/Perth" },
  { value: "Australia/Adelaide", label: "Australia/Adelaide" },
  { value: "Australia/Darwin", label: "Australia/Darwin" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland" },
  { value: "Pacific/Fiji", label: "Pacific/Fiji" },
  { value: "Pacific/Guam", label: "Pacific/Guam" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu" },

  // Africa
  { value: "Africa/Cairo", label: "Africa/Cairo" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi" },
  { value: "Africa/Lagos", label: "Africa/Lagos" },
  { value: "Africa/Accra", label: "Africa/Accra" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca" },
  { value: "Africa/Algiers", label: "Africa/Algiers" },
  { value: "Africa/Tunis", label: "Africa/Tunis" },
] as const;
// Interviews Schema
// --------------------------------------------------

export const interviews = pgTable("interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  projectId: varchar("project_id"),
  status: text("status").notNull().default("pending"),
  slot1: timestamp("slot1"),
  slot2: timestamp("slot2"),
  slot3: timestamp("slot3"),
  selectedSlot: integer("selected_slot"),
  timezone: text("timezone"),
  meetingLink: text("meeting_link"),
  calendarEventId: text("calendar_event_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = typeof interviews.$inferInsert;

// --------------------------------------------------
// Intern Onboarding Schema
// --------------------------------------------------
export const internOnboarding = pgTable("intern_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  linkedinUrl: text("linkedin_url"),
  pinCode: text("pin_code"),
  state: text("state"),
  city: text("city"),
  aadhaarNumber: text("aadhaar_number"),
  panNumber: text("pan_number"),
  bio: text("bio"),
  experienceJson: jsonb("experience_json").$type<unknown[]>().default([]),
  skills: jsonb("skills").$type<unknown[]>().default([]),
  locationTypes: jsonb("location_types").$type<string[]>().default([]),
  preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
  hasLaptop: boolean("has_laptop"),
  previewSummary: text("preview_summary"),
  extraData: jsonb("extra_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  internOnboardingAadhaarUnique: uniqueIndex("intern_onboarding_aadhaar_unique").on(t.aadhaarNumber),
  internOnboardingPanUnique: uniqueIndex("intern_onboarding_pan_unique").on(t.panNumber),
}));

export type InternOnboarding = typeof internOnboarding.$inferSelect;

export const internPayments = pgTable("intern_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  internId: varchar("intern_id").notNull(),
  gateway: text("gateway").notNull().default("razorpay"),
  orderId: text("order_id").notNull(),
  paymentId: text("payment_id"),
  signature: text("signature"),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("created"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  paidAt: timestamp("paid_at"),
  /** GST invoice number, assigned once at payment ("FT/2026-27/0001"). */
  invoiceNumber: text("invoice_number").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InternPayment = typeof internPayments.$inferSelect;
export type InsertInternPayment = typeof internPayments.$inferInsert;

export const internPayouts = pgTable("intern_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  internId: varchar("intern_id").notNull(),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("pending"),
  method: text("method").notNull().default("bank"),
  referenceId: text("reference_id"),
  notes: text("notes"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InternPayout = typeof internPayouts.$inferSelect;
export type InsertInternPayout = typeof internPayouts.$inferInsert;

export const employerPayments = pgTable("employer_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  gateway: text("gateway").notNull().default("razorpay"),
  orderId: text("order_id").notNull(),
  paymentId: text("payment_id"),
  signature: text("signature"),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("created"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  paidAt: timestamp("paid_at"),
  /** GST invoice number, assigned once at payment ("FT/2026-27/0001"). */
  invoiceNumber: text("invoice_number").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmployerPayment = typeof employerPayments.$inferSelect;

/**
 * One running invoice serial per Indian financial year (April-March), shared
 * by employer orders and intern fees so a number is never issued twice.
 */
export const invoiceCounters = pgTable("invoice_counters", {
  fy: text("fy").primaryKey(), // "2026-27"
  last: integer("last").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type InsertEmployerPayment = typeof employerPayments.$inferInsert;

// --------------------------------------------------
// Intern Documents Schema
// --------------------------------------------------
export const internDocuments = pgTable("intern_document", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),

  // Basic metadata for uploaded files. Actual storage (S3/local) can be configured separately.
  profilePhotoName: text("profile_photo_name"),
  profilePhotoType: text("profile_photo_type"),
  profilePhotoSize: integer("profile_photo_size"),
  introVideoName: text("intro_video_name"),
  introVideoType: text("intro_video_type"),
  introVideoSize: integer("intro_video_size"),

  aadhaarImageName: text("aadhaar_image_name"),
  aadhaarImageType: text("aadhaar_image_type"),
  aadhaarImageSize: integer("aadhaar_image_size"),

  panImageName: text("pan_image_name"),
  panImageType: text("pan_image_type"),
  panImageSize: integer("pan_image_size"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InternDocuments = typeof internDocuments.$inferSelect;
// --------------------------------------------------
// Proposals (Employer -> Intern offers)
// --------------------------------------------------
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  projectId: varchar("project_id").notNull(),
  interviewId: varchar("interview_id"),
  flowType: text("flow_type").notNull(), // direct | interview_first
  status: text("status").notNull().default("sent"), // PROPOSAL_STATUSES in lib/proposals.ts
  currency: text("currency").notNull().default("INR"),
  offerDetails: jsonb("offer_details").$type<Record<string, unknown>>().default({}),
  aiRatings: jsonb("ai_ratings").$type<{
    communication?: number;
    coding?: number;
    aptitude?: number;
    overall?: number;
  }>().default({}),
  skills: jsonb("skills").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  internationalFteStatus: text("international_fte_status"),
  hiredAt: timestamp("hired_at"),
});

export type Proposal = typeof proposals.$inferSelect;

export const timesheets = pgTable("timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull(),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  entries: jsonb("entries").$type<unknown>().default([]),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  internNote: text("intern_note"),
  managerNote: text("manager_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Timesheet = typeof timesheets.$inferSelect;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientType: text("recipient_type").notNull(),
  recipientId: varchar("recipient_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  dedupeKey: text("dedupe_key"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Lets scheduled jobs insert with onConflictDoNothing() and send each
  // reminder once.
  notificationsDedupeUniq: uniqueIndex("notifications_dedupe_uniq")
    .on(t.recipientType, t.recipientId, t.dedupeKey)
    .where(sql`${t.dedupeKey} is not null`),
}));

export type Notification = typeof notifications.$inferSelect;

export const profileViews = pgTable("profile_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProfileView = typeof profileViews.$inferSelect;

export const employerSavedSearches = pgTable("employer_saved_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  skills: jsonb("skills").$type<string[]>().default([]),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  jobMode: text("job_mode"),
  minExperience: integer("min_experience").default(0),
  maxExperience: integer("max_experience").default(0),
  minFindternScore: integer("min_findtern_score").default(0),
  maxFindternScore: integer("max_findtern_score").default(100),
  includeNoExperience: boolean("include_no_experience").default(true),
  includeNoScore: boolean("include_no_score").default(true),
  lastNotifiedAt: timestamp("last_notified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employerCartItems = pgTable(
  "employer_cart_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employerId: varchar("employer_id").notNull(),
    projectId: varchar("project_id").notNull(),
    internId: varchar("intern_id").notNull(),
    listType: text("list_type").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    employerCartItemsUnique: uniqueIndex("employer_cart_items_unique").on(
      t.employerId,
      t.projectId,
      t.internId,
      t.listType,
    ),
  }),
);

export type EmployerCartItem = typeof employerCartItems.$inferSelect;
export type InsertEmployerCartItem = typeof employerCartItems.$inferInsert;

export type EmployerSavedSearch = typeof employerSavedSearches.$inferSelect;

// --------------------------------------------------
// Promo Codes (Admin managed, usage tracking)
// --------------------------------------------------
export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(), // "percentage" | "fixed"
  discountValue: integer("discount_value").notNull(), // percentage (e.g., 10 for 10%) or fixed amount in paise (legacy convention)
  maxUsages: integer("max_usages"), // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  minOrderAmountMinor: integer("min_order_amount_minor"), // minimum order amount to apply
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").notNull().default(true),
  /** Where the code can be redeemed: "intern" | "employer" | "both". */
  appliesTo: text("applies_to").notNull().default("intern"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = typeof promoCodes.$inferInsert;

// Promo code usage tracking (to prevent reuse)
export const promoCodeUsages = pgTable("promo_code_usages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull(),
  userId: varchar("user_id").notNull(), // intern or employer id that used the code
  orderId: varchar("order_id"), // payment/order that used this code
  discountAppliedMinor: integer("discount_applied_minor").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  promoCodeUsagesUnique: uniqueIndex("promo_code_usages_unique").on(t.promoCodeId, t.userId),
}));

export type PromoCodeUsage = typeof promoCodeUsages.$inferSelect;
export type InsertPromoCodeUsage = typeof promoCodeUsages.$inferInsert;
// --------------------------------------------------
// College partners + virtual drives
//
// New tables only. The legacy app never reads them, and nothing here writes a
// legacy table except `notifications` (same row shape, new `type` values).
// Access rules live in src/lib/college/access.ts; every read goes through
// src/lib/college/scope.ts.
// --------------------------------------------------

/** AISHE institutions plus colleges added by hand. A partner college has admins. */
export const colleges = pgTable("colleges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  city: text("city"),
  state: text("state"),
  /** AISHE code (C-12345 college, U-0123 university, S-1234 standalone). */
  aisheCode: text("aishe_code"),
  /** URL-safe name for the co-branded drive page. */
  slug: text("slug").notNull(),
  /** Lower-case domains whose verified inboxes prove membership, e.g. ["jklu.edu.in"]. */
  emailDomains: jsonb("email_domains").$type<string[]>().notNull().default([]),
  logoUrl: text("logo_url"),
  /** Paying college with a dashboard. Students of other colleges can still pick them. */
  isPartner: boolean("is_partner").notNull().default(false),
  /** Listed in the marketing "College partners" strip. */
  showOnWebsite: boolean("show_on_website").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegesSlugUnique: uniqueIndex("colleges_slug_unique").on(t.slug),
  collegesAisheUnique: uniqueIndex("colleges_aishe_unique").on(t.aisheCode).where(sql`${t.aisheCode} is not null`),
  collegesNameIdx: index("colleges_name_idx").on(t.name),
}));

export type College = typeof colleges.$inferSelect;

/** Placement officers. Read-only on student data; may run drives, roster and nudges. */
export const collegeAdmins = pgTable("college_admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  /** argon2id, via src/lib/security/password.ts. Never plaintext. */
  password: text("password").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeAdminsEmailUnique: uniqueIndex("college_admins_email_unique").on(t.email),
}));

export type CollegeAdmin = typeof collegeAdmins.$inferSelect;

/** The college's own list of students. A match by email verifies membership. */
export const collegeRoster = pgTable("college_roster", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  /** Lower-cased. */
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  rollNo: text("roll_no"),
  /** Year of study, 1–5. */
  year: integer("year"),
  branch: text("branch"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeRosterUnique: uniqueIndex("college_roster_college_email_unique").on(t.collegeId, t.email),
}));

export type CollegeRosterRow = typeof collegeRoster.$inferSelect;

/**
 * A student's college. One per student. `claimed` = picked from the list;
 * `verified` = roster email match or a verified inbox on the college domain.
 * Only verified (or hand-included) students are shown to drive employers.
 */
export const collegeMemberships = pgTable("college_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  collegeId: varchar("college_id").notNull(),
  status: text("status").notNull().default("claimed"), // claimed | verified
  verifiedBy: text("verified_by"), // roster | email_domain
  year: integer("year"),
  branch: text("branch"),
  consentId: varchar("consent_id"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  /** Set when consent is withdrawn; the row stays for the audit trail. */
  leftAt: timestamp("left_at"),
}, (t) => ({
  collegeMembershipsUserUnique: uniqueIndex("college_memberships_user_unique").on(t.userId),
  collegeMembershipsCollegeIdx: index("college_memberships_college_idx").on(t.collegeId),
}));

export type CollegeMembership = typeof collegeMemberships.$inferSelect;

/**
 * DPDP consent ledger. Append-only: withdrawing sets `withdrawnAt`, a new
 * grant is a new row. `noticeHash` pins the exact notice text shown.
 */
export const collegeConsents = pgTable("college_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  collegeId: varchar("college_id").notNull(),
  noticeVersion: text("notice_version").notNull(),
  noticeHash: text("notice_hash").notNull(),
  /** Subset of CONSENT_PURPOSES in src/lib/college/consent.ts. */
  purposes: jsonb("purposes").$type<string[]>().notNull().default([]),
  /** Student declared they are 18 or older. Under-18 needs a guardian (not built). */
  declaredAdult: boolean("declared_adult").notNull().default(false),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  withdrawnAt: timestamp("withdrawn_at"),
  userAgent: text("user_agent"),
}, (t) => ({
  collegeConsentsUserIdx: index("college_consents_user_idx").on(t.userId),
}));

export type CollegeConsent = typeof collegeConsents.$inferSelect;

/** A virtual placement drive and its share link. Only the token's SHA-256 is stored. */
export const collegeDrives = pgTable("college_drives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("internship"), // internship | full_time
  description: text("description"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  /** { minCgpa?, minScore?, years?: number[], branches?: string[] } */
  eligibility: jsonb("eligibility").$type<Record<string, unknown>>().notNull().default({}),
  includeUserIds: jsonb("include_user_ids").$type<string[]>().notNull().default([]),
  excludeUserIds: jsonb("exclude_user_ids").$type<string[]>().notNull().default([]),
  tokenHash: text("token_hash").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  collegeDrivesTokenUnique: uniqueIndex("college_drives_token_unique").on(t.tokenHash),
  collegeDrivesCollegeIdx: index("college_drives_college_idx").on(t.collegeId),
}));

export type CollegeDrive = typeof collegeDrives.$inferSelect;

/** An employer who opened a valid drive link while signed in. Their pass into the drive. */
export const collegeDriveEmployers = pgTable("college_drive_employers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driveId: varchar("drive_id").notNull(),
  employerId: varchar("employer_id").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (t) => ({
  collegeDriveEmployersUnique: uniqueIndex("college_drive_employers_unique").on(t.driveId, t.employerId),
}));

export const collegeDriveShortlist = pgTable("college_drive_shortlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driveId: varchar("drive_id").notNull(),
  employerId: varchar("employer_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeDriveShortlistUnique: uniqueIndex("college_drive_shortlist_unique").on(t.driveId, t.employerId, t.userId),
}));

/** "Meet now / in 5 / in 10 minutes" requests inside a drive. */
export const collegeDriveMeetings = pgTable("college_drive_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driveId: varchar("drive_id").notNull(),
  employerId: varchar("employer_id").notNull(),
  userId: varchar("user_id").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  status: text("status").notNull().default("requested"), // requested | accepted | declined | expired | cancelled
  meetingLink: text("meeting_link"),
  calendarEventId: text("calendar_event_id"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeDriveMeetingsUserIdx: index("college_drive_meetings_user_idx").on(t.userId, t.status),
  collegeDriveMeetingsDriveIdx: index("college_drive_meetings_drive_idx").on(t.driveId),
}));

export type CollegeDriveMeeting = typeof collegeDriveMeetings.$inferSelect;

/** Last heartbeat per student. Online = seen within ONLINE_WINDOW_MS. */
export const collegePresence = pgTable("college_presence", {
  userId: varchar("user_id").primaryKey(),
  collegeId: varchar("college_id").notNull(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (t) => ({
  collegePresenceCollegeIdx: index("college_presence_college_idx").on(t.collegeId, t.lastSeenAt),
}));

/** A placement officer's chase. Rate-limited per student and kind. */
export const collegeNudges = pgTable("college_nudges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  adminId: varchar("admin_id").notNull(),
  userId: varchar("user_id").notNull(),
  kind: text("kind").notNull(), // online | offer | interview
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeNudgesUserIdx: index("college_nudges_user_idx").on(t.userId, t.kind, t.createdAt),
}));

/** Who opened a student's recording or report, and when. Append-only. */
export const collegeAuditLog = pgTable("college_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  actorType: text("actor_type").notNull(), // college_admin | admin
  actorId: varchar("actor_id").notNull(),
  action: text("action").notNull(), // view_recording | view_report | export_roster | ...
  subjectUserId: varchar("subject_user_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  collegeAuditLogCollegeIdx: index("college_audit_log_college_idx").on(t.collegeId, t.createdAt),
}));

/** Web Push subscriptions (students accept instant meetings from their phone). */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  pushSubscriptionsEndpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint),
  pushSubscriptionsUserIdx: index("push_subscriptions_user_idx").on(t.userId),
}));
