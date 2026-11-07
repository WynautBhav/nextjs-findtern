import type { CompanyDraft, ProjectDraft } from "@/lib/employer-onboarding";

/** localStorage is not observable, so there is nothing to subscribe to. */
export function subscribeToNothing() {
  return () => {};
}

/* Returns the raw string, not a parsed object: useSyncExternalStore compares
 * snapshots with Object.is, and JSON.parse would hand back a fresh object on
 * every call - an unconditional re-render loop. */
export function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export type DraftPatch = {
  company?: Partial<CompanyDraft>;
  project?: Partial<ProjectDraft>;
};

export function parseDraft(raw: string | null): DraftPatch {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    // Whitelisted keys only; the form re-validates on submit anyway.
    return {
      company: pick(record.company, COMPANY_KEYS) as Partial<CompanyDraft>,
      project: pick(record.project, PROJECT_KEYS) as Partial<ProjectDraft>,
    };
  } catch {
    // A corrupt draft is not worth an error state - the form still works.
    return {};
  }
}

/** Keep only the keys this form wrote, so a hand-edited draft cannot inject fields. */
function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

// companyEmail is deliberately absent: it is read-only and always the server's.
export const COMPANY_KEYS = [
  "companyName",
  "websiteUrl",
  "logoUrl",
  "companySize",
  "country",
  "state",
  "city",
  "primaryContactName",
  "primaryContactRole",
  "primaryContactCountryCode",
  "primaryContactPhone",
  "escalationContactName",
  "escalationContactRole",
  "escalationContactEmail",
  "escalationContactCountryCode",
  "escalationContactPhone",
  "gstNumber",
  "billingPincode",
] as const;

export const PROJECT_KEYS = [
  "projectName",
  "skills",
  "scopeOfWork",
  "fullTimeOffer",
  "locationType",
  "preferredLocations",
  "pincode",
  "city",
  "state",
  "timezone",
] as const;
