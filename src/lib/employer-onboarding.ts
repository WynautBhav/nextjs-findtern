import {
  companySizes,
  countryCodes,
  scopeOfWorkOptions,
  timezones,
  type employers,
  type projects,
} from "@/lib/db/schema";

/**
 * Employer onboarding shape.
 *
 * Lives in `lib` rather than in the form component for the reason spelled out
 * in `lib/onboarding.ts`: a `"use client"` module can only hand a server
 * component *components*. A plain object exported from one arrives as an empty
 * client-reference proxy, so `{ ...EMPTY_DRAFT }` yields `{}` and the page
 * renders with silently blank props. Types are erased and safe to re-export;
 * values are not.
 *
 * Two stages, matching the legacy split between `company-setup.tsx` and
 * `employer-onboarding.tsx`: the company record first, then the project the
 * intern will actually work on. Option lists come straight off the schema so
 * the form cannot drift from what the database will accept.
 */

export type CompanyDraft = {
  companyName: string;
  websiteUrl: string;
  companyEmail: string;
  logoUrl: string;
  companySize: string;
  country: string;
  state: string;
  city: string;
  primaryContactName: string;
  primaryContactRole: string;
  primaryContactCountryCode: string;
  primaryContactPhone: string;
  escalationContactName: string;
  escalationContactRole: string;
  escalationContactEmail: string;
  escalationContactCountryCode: string;
  escalationContactPhone: string;
  gstNumber: string;
  /** Decides CGST+SGST vs IGST on invoices (lib/gst). */
  billingPincode: string;
};

export type ProjectDraft = {
  projectName: string;
  skills: string[];
  scopeOfWork: string;
  fullTimeOffer: boolean;
  locationType: string;
  preferredLocations: string[];
  pincode: string;
  city: string;
  state: string;
  timezone: string;
};

export type OnboardingDraft = {
  company: CompanyDraft;
  project: ProjectDraft;
};

export const COMPANY_SIZE_OPTIONS = companySizes;
export const SCOPE_OPTIONS = scopeOfWorkOptions;
export const TIMEZONE_OPTIONS = timezones;
export const COUNTRY_CODE_OPTIONS = countryCodes;

/** Matches `projects.location_type`; the legacy form sent these exact strings. */
export const LOCATION_TYPES = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

/**
 * Personal-mail domains.
 *
 * A Findtern employer account has to be reachable at a work address - the
 * legacy rule is the mirror image of the intern rule (`insertUserSchema`
 * *requires* a personal domain; `insertEmployerSchema` requires a non-personal
 * one). Same list, inverted, kept in sync by hand with `schema.ts`.
 */
export const PERSONAL_EMAIL_DOMAINS = new Set([
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

/** True when the address is a personal mailbox and so cannot register a company. */
export function isPersonalEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

/**
 * Company fields every employer must fill in. Logo, GST number and the
 * escalation contact are the optional ones (and say so on the form); the
 * billing PIN is required only for an Indian address - see `needsBillingPincode`.
 * One list so the onboarding form, the account form, `PATCH /api/employer/:id`
 * and the dashboard gate cannot disagree about what "complete" means.
 */
export const REQUIRED_COMPANY_FIELDS = [
  ["companyName", "Company name"],
  ["websiteUrl", "Website"],
  ["companySize", "Company size"],
  ["country", "Country"],
  ["state", "State"],
  ["city", "City"],
  ["primaryContactName", "Primary contact name"],
  ["primaryContactRole", "Primary contact role"],
  ["phoneNumber", "Phone"],
] as const;

export type RequiredCompanyField = (typeof REQUIRED_COMPANY_FIELDS)[number][0];

/** India (or a blank country, which the form defaults to India) needs a billing PIN for GST. */
export function needsBillingPincode(country: string | null | undefined): boolean {
  const c = (country ?? "").trim();
  return !c || /^(india|in)$/i.test(c);
}

/** Labels of the required company fields that are blank on this record. */
export function missingCompanyFields(
  row: Partial<Record<RequiredCompanyField, string | null | undefined>>,
): string[] {
  return REQUIRED_COMPANY_FIELDS.filter(([key]) => !(row[key] ?? "").trim()).map(([, label]) => label);
}

export function emptyCompany(): CompanyDraft {
  return {
    companyName: "",
    websiteUrl: "",
    companyEmail: "",
    logoUrl: "",
    companySize: "",
    country: "",
    state: "",
    city: "",
    primaryContactName: "",
    primaryContactRole: "",
    primaryContactCountryCode: "+91",
    primaryContactPhone: "",
    escalationContactName: "",
    escalationContactRole: "",
    escalationContactEmail: "",
    escalationContactCountryCode: "+91",
    escalationContactPhone: "",
    gstNumber: "",
    billingPincode: "",
  };
}

export function emptyProject(): ProjectDraft {
  return {
    projectName: "",
    skills: [],
    scopeOfWork: "",
    fullTimeOffer: false,
    locationType: "",
    preferredLocations: [],
    pincode: "",
    city: "",
    state: "",
    timezone: "Asia/Kolkata",
  };
}

export function emptyDraft(): OnboardingDraft {
  return { company: emptyCompany(), project: emptyProject() };
}

type EmployerRow = typeof employers.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

/** Seed stage 1 from the saved employer row. */
export function companyFromRecord(row: EmployerRow): CompanyDraft {
  return {
    companyName: row.companyName ?? "",
    websiteUrl: row.websiteUrl ?? "",
    companyEmail: row.companyEmail ?? "",
    logoUrl: row.logoUrl ?? "",
    companySize: row.companySize ?? "",
    country: row.country ?? "",
    state: row.state ?? "",
    city: row.city ?? "",
    primaryContactName: row.primaryContactName ?? row.name ?? "",
    primaryContactRole: row.primaryContactRole ?? "",
    // The table has no `primary_contact_*` columns of its own - the primary
    // contact's number is the account's `country_code` + `phone_number`, which
    // is how the legacy handler stored it (routes.ts:4113).
    primaryContactCountryCode: row.countryCode ?? "+91",
    primaryContactPhone: row.phoneNumber ?? "",
    escalationContactName: row.escalationContactName ?? "",
    escalationContactRole: row.escalationContactRole ?? "",
    escalationContactEmail: row.escalationContactEmail ?? "",
    escalationContactCountryCode: row.escalationContactCountryCode ?? "+91",
    escalationContactPhone: row.escalationContactPhone ?? "",
    gstNumber: row.gstNumber ?? "",
    billingPincode: row.billingPincode ?? "",
  };
}

/**
 * Seed stage 2 from an existing project.
 *
 * Only the newest one is offered. `employer-onboarding.tsx` created exactly one
 * project per pass; offering a list to edit would imply a per-row update route
 * that does not exist.
 */
export function projectFromRecord(row: ProjectRow): ProjectDraft {
  return {
    projectName: row.projectName ?? "",
    skills: Array.isArray(row.skills) ? row.skills.filter(Boolean) : [],
    scopeOfWork: row.scopeOfWork ?? "",
    fullTimeOffer: row.fullTimeOffer ?? false,
    locationType: row.locationType ?? "",
    preferredLocations: Array.isArray(row.preferredLocations)
      ? row.preferredLocations.filter(Boolean)
      : [],
    pincode: row.pincode ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    timezone: row.timezone ?? "Asia/Kolkata",
  };
}
