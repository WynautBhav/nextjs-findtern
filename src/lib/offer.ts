import { INR_PER_USD } from "./currency.ts";

/**
 * `proposals.offer_details`, typed.
 *
 * The legacy app owns this shape and both apps share the database, so money
 * here is in MAJOR units (rupees or dollars, per `proposals.currency`):
 * `monthlyAmount`, `totalPrice`, `hourlyRate`, `perHireCharge`. Everything
 * in the new app reads it through `parseOffer` and writes it through
 * `buildOffer`; nothing else touches the JSON directly.
 */

export type OfferCurrency = "INR" | "USD";

export type Offer = {
  currency: OfferCurrency;
  roleTitle: string;
  jd: string;
  mode: string;
  location: string;
  startDate: string | null;
  /** "1m" | "2m" | "3m" | "6m" */
  duration: string;
  months: number;
  monthlyHours: number;
  shiftFrom: string;
  shiftTo: string;
  timezone: string;
  laptop: string;
  paidLeavesPerMonth: number;
  /** Minor units (paise/cents) of `currency`; null when the offer has none. */
  monthlyMinor: number | null;
  totalMinor: number | null;
  hourlyRateMinor: number | null;
  perHireMinor: number | null;
  fullTime: {
    annualCtcMinor: number | null;
    offerLetterUrl: string | null;
    offerLetterKey: string | null;
    jobMode: string;
    location: string;
  } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const toMinor = (major: unknown) => {
  const n = num(major);
  return n != null && n > 0 ? Math.round(n * 100) : null;
};

export function monthsOf(duration: unknown): number {
  const m = /^(\d+)\s*m/i.exec(String(duration ?? ""));
  return m ? Math.max(1, Number(m[1])) : 1;
}

export function parseOffer(raw: unknown, rowCurrency?: string | null): Offer {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const currency: OfferCurrency =
    String(rowCurrency ?? o.currency ?? "INR").toUpperCase() === "USD" ? "USD" : "INR";
  const duration = str(o.duration) || "1m";
  const ft = o.fullTimeOffer && typeof o.fullTimeOffer === "object" ? (o.fullTimeOffer as Record<string, unknown>) : null;

  return {
    currency,
    roleTitle: str(o.roleTitle) || (ft ? str(ft.jobTitle) : ""),
    jd: str(o.jd) || str(o.message),
    mode: str(o.mode),
    location: str(o.location) || str(o.city),
    startDate: str(o.startDate) || null,
    duration,
    months: monthsOf(duration),
    monthlyHours: num(o.monthlyHours) ?? 0,
    shiftFrom: str(o.shiftFrom),
    shiftTo: str(o.shiftTo),
    timezone: str(o.timezone),
    laptop: str(o.laptop),
    paidLeavesPerMonth: num(o.paidLeavesPerMonth) ?? 0,
    monthlyMinor: toMinor(o.monthlyAmount ?? o.monthly_amount),
    totalMinor: toMinor(o.totalPrice),
    hourlyRateMinor: toMinor(o.hourlyRate),
    perHireMinor: num(o.perHireCharge) === 0 ? 0 : toMinor(o.perHireCharge),
    fullTime: ft
      ? {
          annualCtcMinor: num(ft.annualCtcMinor) ?? toMinor(ft.annualCtc),
          offerLetterUrl: str(ft.offerLetterUrl) || str(o.offerLetterUrl) || null,
          offerLetterKey: str(ft.offerLetterKey) || null,
          jobMode: str(ft.jobMode),
          location: [str(ft.jobLocationCity), str(ft.jobLocationState)].filter(Boolean).join(", "),
        }
      : null,
  };
}


/** The intern's share of what the employer pays each month (legacy routes.ts:13408). */
export const INTERN_STIPEND_SHARE = 0.5;

/**
 * Legacy rule (proposals.tsx:590): a scored candidate below 6 is not paid a
 * stipend. An unscored candidate (0 / missing) is not penalised.
 */
export function stipendEligible(score: number | null | undefined): boolean {
  const s = Number(score ?? 0);
  return !(s > 0 && s < 6);
}

/**
 * The stipend the intern sees, always in INR minor units (legacy rule: USD
 * offers are shown converted): half of the employer's monthly amount, rounded
 * down, and 0 for a candidate scored below 6. Null when the offer has no
 * monthly amount.
 */
export function internStipendInrMinor(offer: Offer, score?: number | null): number | null {
  if (offer.monthlyMinor == null) return null;
  if (!stipendEligible(score)) return 0;
  const inr = offer.currency === "USD" ? offer.monthlyMinor * INR_PER_USD : offer.monthlyMinor;
  return Math.floor(inr * INTERN_STIPEND_SHARE);
}

/** Today's date in India (YYYY-MM-DD) - offers are dated in IST. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Legacy rule (proposals.tsx:483): an offer can be answered only while its
 * start date is still ahead. On the start day it reads as expired.
 */
export function offerPastStart(startDate: string | null | undefined, now: Date = new Date()): boolean {
  const day = String(startDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayIst(now);
}

/** Formal offers an intern may decline before the guarantee ends. */
export const FREE_DECLINES = 3;

/** Score the offer was priced on, when the row carries one. */
export function offerScore(raw: unknown): number | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = Number(o.candidateScore);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type OfferInput = {
  currency: OfferCurrency;
  roleTitle: string;
  jd?: string;
  mode: string;
  location?: string;
  city?: string;
  state?: string;
  /** Hybrid only: days per week in the office and at home. */
  officeDays?: number;
  homeDays?: number;
  startDate: string;
  duration: string;
  monthlyHours: number;
  shiftFrom?: string;
  shiftTo?: string;
  timezone?: string;
  laptop?: string;
  paidLeavesPerMonth?: number;
  hourlyRateMinor: number;
  perHireMinor: number;
  /** Employer override of the monthly amount, minor units. */
  monthlyOverrideMinor?: number | null;
  candidateScore?: number;
  projectSkills?: string[];
};

/** Legacy `offer_details` (major units), with the money computed here. */
export function buildOffer(input: OfferInput): Record<string, unknown> {
  const months = monthsOf(input.duration);
  const monthlyMinor = input.monthlyOverrideMinor ?? Math.round(input.monthlyHours * input.hourlyRateMinor);
  const totalMinor = monthlyMinor * months + input.perHireMinor;
  const major = (minor: number) => Math.round(minor) / 100;
  return {
    roleTitle: input.roleTitle,
    jd: input.jd ?? "",
    mode: input.mode,
    currency: input.currency,
    location: input.mode === "remote" ? "Remote" : (input.location ?? ""),
    ...(input.mode !== "remote" ? { city: input.city ?? "", state: input.state ?? "" } : {}),
    ...(input.mode === "hybrid" ? { wfoDays: input.officeDays ?? null, wfhDays: input.homeDays ?? null } : {}),
    startDate: input.startDate,
    duration: input.duration,
    shiftFrom: input.shiftFrom ?? "",
    shiftTo: input.shiftTo ?? "",
    timezone: input.timezone ?? "Asia/Kolkata",
    laptop: input.laptop ?? "",
    paidLeavesPerMonth: input.paidLeavesPerMonth ?? 0,
    monthlyHours: input.monthlyHours,
    monthlyAmount: major(monthlyMinor),
    totalPrice: major(totalMinor),
    hourlyRate: major(input.hourlyRateMinor),
    perHireCharge: major(input.perHireMinor),
    candidateScore: input.candidateScore ?? null,
    projectSkills: input.projectSkills ?? [],
  };
}
