import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Interviews & proposals share timezone list

const personalEmailDomains = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "live.com",
  "rediffmail.com",
]);

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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true, // role backend se default "intern" set karega
  emailVerified: true,
}).extend({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .refine(
      (email) => {
        const domain = email.split("@").pop();
        return !!domain && personalEmailDomains.has(domain);
      },
      {
        message: "Please use a personal email address (Gmail, Yahoo, Outlook, etc.)",
      },
    ),
  countryCode: z
    .string()
    .min(1, "Country code is required")
    .regex(/^\+\d+$/, "Invalid country code"),
  phoneNumber: z
    .string()
    .regex(/^\d{10}$/, "Phone number must be 10 digits")
    .refine(
      (v) => {
        const d = String(v ?? "");
        if (d.length !== 10) return false;
        if (/^(\d)\1{9}$/.test(d)) return false;
        const asc = "01234567890123456789";
        const desc = "98765432109876543210";
        if (asc.includes(d) || desc.includes(d)) return false;
        return true;
      },
      { message: "Please enter a valid phone number" },
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  agreedToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the Terms & Conditions",
  }),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
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

export const insertEmployerSchema = createInsertSchema(employers).omit({
  id: true,
  passwordChangedAt: true,
  createdAt: true,
  emailVerified: true,
  isActive: true,
}).extend({
  name: z.string().min(2, "Name must be at least 2 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  companyEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .refine(
      (email) => {
        const domain = email.split("@").pop();
        return !!domain && !personalEmailDomains.has(domain);
      },
      {
        message: "Please use a company/work email address (not Gmail, Yahoo, Outlook, etc.)",
      },
    ),
  countryCode: z
    .string()
    .min(1, "Country code is required")
    .regex(/^\+\d+$/, "Invalid country code"),
  phoneNumber: z
    .string()
    .min(6, "Phone number must be at least 6 digits")
    .max(15, "Phone number too long")
    .regex(/^\d+$/, "Phone number must be digits only"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  agreedToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the Terms & Conditions",
  }),
}).superRefine((data, ctx) => {
  const code = String((data as Record<string, unknown>)?.countryCode ?? "").trim();
  const digits = String((data as Record<string, unknown>)?.phoneNumber ?? "").replace(/\D/g, "");

  if (code === "+91" && digits.length !== 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phoneNumber"],
      message: "Phone number must be 10 digits for Indian numbers",
    });
  }

  if (code !== "+91" && digits.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phoneNumber"],
      message: "Phone number must be 11 digits",
    });
  }
});

export type InsertEmployer = z.infer<typeof insertEmployerSchema>;
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

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
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
  gstApplicable: boolean("gst_applicable").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PricingPlan = typeof pricingPlans.$inferSelect;
export type InsertPricingPlan = typeof pricingPlans.$inferInsert;

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

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
}).extend({
  projectName: z.string().min(2, "Project name must be at least 2 characters"),
  skills: z.array(z.string()).min(1, "Select at least one skill"),
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
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

export const scopeOfWorkOptions = [
  { value: "short-term", label: "Short-Term: 30–60 days" },
  { value: "medium-term", label: "Medium-Term: 60–90 days" },
  { value: "long-term", label: "Long-Term: 90+ days" },
  { value: "not-sure", label: "Not Sure" },
] as const;

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

export const insertInternOnboardingSchema = createInsertSchema(internOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInternOnboarding = z.infer<typeof insertInternOnboardingSchema>;
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmployerPayment = typeof employerPayments.$inferSelect;
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

export const insertInternDocumentsSchema = createInsertSchema(internDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInternDocuments = z.infer<typeof insertInternDocumentsSchema>;
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
  status: text("status").notNull().default("sent"), // draft | sent | accepted | rejected | interview_scheduled
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

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  hiredAt: true,
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
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

export const insertTimesheetSchema = createInsertSchema(timesheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  approvedAt: true,
  rejectedAt: true,
});

export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
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
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const profileViews = pgTable("profile_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProfileViewSchema = createInsertSchema(profileViews).omit({
  id: true,
  createdAt: true,
});

export type InsertProfileView = z.infer<typeof insertProfileViewSchema>;
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

export const insertEmployerSavedSearchSchema = createInsertSchema(employerSavedSearches).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployerSavedSearch = z.infer<typeof insertEmployerSavedSearchSchema>;
export type EmployerSavedSearch = typeof employerSavedSearches.$inferSelect;

// --------------------------------------------------
// Promo Codes (Admin managed, usage tracking)
// --------------------------------------------------
export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(), // "percentage" | "fixed"
  discountValue: integer("discount_value").notNull(), // percentage (e.g., 10 for 10%) or fixed amount in minor units
  maxUsages: integer("max_usages"), // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  minOrderAmountMinor: integer("min_order_amount_minor"), // minimum order amount to apply
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = typeof promoCodes.$inferInsert;

// Promo code usage tracking (to prevent reuse)
export const promoCodeUsages = pgTable("promo_code_usages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull(),
  userId: varchar("user_id").notNull(), // intern who used the code
  orderId: varchar("order_id"), // payment/order that used this code
  discountAppliedMinor: integer("discount_applied_minor").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  promoCodeUsagesUnique: uniqueIndex("promo_code_usages_unique").on(t.promoCodeId, t.userId),
}));

export type PromoCodeUsage = typeof promoCodeUsages.$inferSelect;
export type InsertPromoCodeUsage = typeof promoCodeUsages.$inferInsert;