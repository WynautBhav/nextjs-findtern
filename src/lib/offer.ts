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
  /** Off-remote only. Legacy rows store just `location: "City, State"`; split here (DB-10). */
  city: string;
  state: string;
  /** Hybrid split. Legacy keys `workFromOfficeDays`/`workFromHomeDays`, older new-app rows `wfoDays`/`wfhDays` (EMH-02). */
  officeDays: number | null;
  homeDays: number | null;
  startDate: string | null;
  /** "1m" | "2m" | "3m" | "6m" */
  duration: string;
  months: number;
  monthlyHours: number;
  /** Legacy `weeklySchedule`; drives the working days in a month. */
  weeklySchedule: WeeklySchedule;
  /** "HH:MM", or "flexible" when the intern sets the hours (stored as `flexibleHours`). */
  shiftFrom: string;
  shiftTo: string;
  timezone: string;
  /** "company" | "candidate" (legacy values; the new app once wrote "intern"). */
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
    timezone: string;
    shiftFrom: string;
    shiftTo: string;
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

/**
 * Billable hours come from the working week, not from a typed number (bug
 * sheet 22 Oct; legacy employer-send-proposal.tsx:533-659): working days in a
 * month for the schedule, less paid leave, at 8 hours a day.
 */
export const WEEKLY_SCHEDULES = {
  mon_fri: { label: "Monday to Friday", days: 22 },
  mon_sat: { label: "Monday to Saturday", days: 26 },
  sun_thu: { label: "Sunday to Thursday", days: 22 },
} as const;
export type WeeklySchedule = keyof typeof WEEKLY_SCHEDULES;
export const HOURS_PER_DAY = 8;
/** Paid leave choices a month, as in legacy (half days allowed). */
export const PAID_LEAVE_OPTIONS = [0, 1, 1.5, 2, 2.5, 3] as const;

export function weeklyScheduleOf(v: unknown): WeeklySchedule {
  const s = String(v ?? "").trim().toLowerCase();
  return s in WEEKLY_SCHEDULES ? (s as WeeklySchedule) : "mon_fri";
}

export function scheduledMonthlyHours(schedule: WeeklySchedule, paidLeavesPerMonth: number): number {
  const leaves = Number.isFinite(paidLeavesPerMonth) ? Math.max(0, paidLeavesPerMonth) : 0;
  return Math.max(0, Math.round((billableWorkingDays(schedule) - leaves) * HOURS_PER_DAY));
}

/**
 * The day count a month is billed on: the published average for the
 * schedule (22 for Mon–Fri and Sun–Thu, 26 for Mon–Sat), never the calendar.
 * Owner decision, 28 Oct 2026: legacy and the marketing calculator both bill
 * a flat month, so every month of an engagement costs the same and the quote
 * matches the rate card.
 */
export function billableWorkingDays(schedule: WeeklySchedule): number {
  return WEEKLY_SCHEDULES[schedule].days;
}

export function monthsOf(duration: unknown): number {
  const m = /^(\d+)\s*m/i.exec(String(duration ?? ""));
  return m ? Math.max(1, Number(m[1])) : 1;
}

/**
 * The hiring fee carried by the offer. The legacy edit page saves totalPrice
 * with the fee already inside and drops `perHireCharge`; without this, the fee
 * would be added on top again at checkout (DB-02). Inferred only when both
 * amounts are stored and the total is above the engagement; otherwise null,
 * and checkout adds the standard fee.
 */
function perHireOf(o: Record<string, unknown>, months: number): number | null {
  if (o.perHireCharge != null) return num(o.perHireCharge) === 0 ? 0 : toMinor(o.perHireCharge);
  const total = num(o.totalPrice);
  const monthly = num(o.monthlyAmount ?? o.monthly_amount);
  return total != null && monthly != null && total > monthly * months ? toMinor(total - monthly * months) : null;
}

/**
 * Who provides the laptop, in legacy's words: "company" or "candidate"
 * (EMH-04). The new app wrote "intern" for a while; legacy "yes"/"own" mean
 * the same two things.
 */
export function normalizeLaptop(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "company" || s === "yes") return "company";
  if (s === "candidate" || s === "intern" || s === "own" || s === "no") return "candidate";
  return s;
}

/** "Company provides" / "Candidate's own laptop", for display. */
export function laptopLabel(v: unknown): string {
  const s = normalizeLaptop(v);
  if (s === "company") return "Company provides";
  if (s === "candidate") return "Candidate's own laptop";
  return s ? s : "Not specified";
}

/**
 * City and state of an on-site or hybrid offer. Legacy writes only
 * `location: "City, State"` (DB-10); the new app also stores `city`/`state`.
 */
export function placeOf(o: Record<string, unknown>): { city: string; state: string } {
  const city = str(o.city);
  const state = str(o.state);
  if (city || state) return { city, state };
  const loc = str(o.location);
  if (!loc || loc.toLowerCase() === "remote") return { city: "", state: "" };
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] ?? "", state: "" };
  return { city: parts.slice(0, -1).join(", "), state: parts[parts.length - 1] };
}

/** Hybrid split, from the legacy keys or the older new-app ones (EMH-02). */
export function hybridDaysOf(o: Record<string, unknown>): { officeDays: number | null; homeDays: number | null } {
  const pick = (...vs: unknown[]) => {
    for (const v of vs) {
      const n = num(v);
      if (n != null && n > 0) return n;
    }
    return null;
  };
  return {
    officeDays: pick(o.workFromOfficeDays, o.wfoDays),
    homeDays: pick(o.workFromHomeDays, o.wfhDays),
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/**
 * The job description as plain text. Legacy's Quill editor stored HTML
 * (`<p>…</p>`), and since EMH-44 the new app stores simple paragraphs too,
 * so every new-app reader gets text with its line breaks and never a raw tag
 * (EMH-28). Not a sanitiser: the output is text, rendered as text.
 */
export function jdToText(v: string): string {
  if (!/<[a-z!/]/i.test(v)) return v;
  return v
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Plain text → the paragraph HTML legacy pages render (`<p>` per paragraph,
 * `<br>` per line), escaped, so line breaks survive on the legacy site (EMH-44).
 */
export function jdToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(esc).join("<br>")}</p>`)
    .join("");
}

/** Working days a week for a schedule (office + home must add up to it; legacy rule, EMH-27). */
export function workingDaysPerWeek(schedule: WeeklySchedule): number {
  return schedule === "mon_sat" ? 6 : 5;
}

/**
 * Shift keys as stored. Flexible hours are written as empty times plus
 * `flexibleHours: true`, so legacy pages read "Not specified" instead of a
 * time they can't parse and a legacy edit has nothing to blank (DB-19).
 */
export function shiftFields(from: string | undefined, to: string | undefined): Record<string, unknown> {
  const f = String(from ?? "").trim();
  const t = String(to ?? "").trim();
  if (!f || !t || f.toLowerCase() === "flexible" || t.toLowerCase() === "flexible") {
    return { shiftFrom: "", shiftTo: "", flexibleHours: true };
  }
  return { shiftFrom: f, shiftTo: t, flexibleHours: false };
}

export function parseOffer(raw: unknown, rowCurrency?: string | null): Offer {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const currency: OfferCurrency =
    String(rowCurrency ?? o.currency ?? "INR").toUpperCase() === "USD" ? "USD" : "INR";
  const duration = str(o.duration) || "1m";
  const ft = o.fullTimeOffer && typeof o.fullTimeOffer === "object" ? (o.fullTimeOffer as Record<string, unknown>) : null;

  const place = placeOf(o);
  const days = hybridDaysOf(o);
  const flexible = o.flexibleHours === true || str(o.shiftFrom).toLowerCase() === "flexible";
  return {
    currency,
    roleTitle: str(o.roleTitle) || (ft ? str(ft.jobTitle) : ""),
    jd: jdToText(str(o.jd) || str(o.message)),
    mode: str(o.mode),
    location: str(o.location) || str(o.city),
    city: place.city,
    state: place.state,
    officeDays: days.officeDays,
    homeDays: days.homeDays,
    startDate: str(o.startDate) || null,
    duration,
    months: monthsOf(duration),
    monthlyHours: num(o.monthlyHours) ?? 0,
    weeklySchedule: weeklyScheduleOf(o.weeklySchedule),
    shiftFrom: flexible ? "flexible" : str(o.shiftFrom),
    shiftTo: flexible ? "flexible" : str(o.shiftTo),
    timezone: str(o.timezone),
    laptop: normalizeLaptop(o.laptop),
    paidLeavesPerMonth: num(o.paidLeavesPerMonth) ?? 0,
    monthlyMinor: toMinor(o.monthlyAmount ?? o.monthly_amount),
    totalMinor: toMinor(o.totalPrice),
    hourlyRateMinor: toMinor(o.hourlyRate),
    perHireMinor: perHireOf(o, monthsOf(duration)),
    fullTime: ft
      ? {
          annualCtcMinor: num(ft.annualCtcMinor) ?? toMinor(ft.annualCtc),
          offerLetterUrl: str(ft.offerLetterUrl) || str(o.offerLetterUrl) || null,
          offerLetterKey: str(ft.offerLetterKey) || null,
          jobMode: str(ft.jobMode),
          location: [str(ft.jobLocationCity), str(ft.jobLocationState)].filter(Boolean).join(", "),
          timezone: str(ft.timezone),
          shiftFrom: str(ft.shiftFrom),
          shiftTo: str(ft.shiftTo),
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
  /** From `scheduledMonthlyHours`; the composer never sends its own. */
  monthlyHours: number;
  weeklySchedule?: WeeklySchedule;
  shiftFrom?: string;
  shiftTo?: string;
  timezone?: string;
  laptop?: string;
  paidLeavesPerMonth?: number;
  hourlyRateMinor: number;
  perHireMinor: number;
  candidateScore?: number;
  projectSkills?: string[];
};

/** Legacy `offer_details` (major units), with the money computed here. */
export function buildOffer(input: OfferInput): Record<string, unknown> {
  const months = monthsOf(input.duration);
  // Always rate × hours: a typed monthly figure could undercut the band rate.
  const monthlyMinor = Math.round(input.monthlyHours * input.hourlyRateMinor);
  const totalMinor = monthlyMinor * months + input.perHireMinor;
  const major = (minor: number) => Math.round(minor) / 100;
  return {
    roleTitle: input.roleTitle,
    jd: jdToHtml(jdToText(input.jd ?? "")),
    mode: input.mode,
    currency: input.currency,
    location:
      input.mode === "remote"
        ? "Remote"
        : [input.city, input.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ") || (input.location ?? ""),
    ...(input.mode !== "remote" ? { city: input.city ?? "", state: input.state ?? "" } : {}),
    // Legacy keys (EMH-02): legacy writes 0/0 for non-hybrid offers.
    workFromOfficeDays: input.mode === "hybrid" ? (input.officeDays ?? 0) : 0,
    workFromHomeDays: input.mode === "hybrid" ? (input.homeDays ?? 0) : 0,
    startDate: input.startDate,
    duration: input.duration,
    ...shiftFields(input.shiftFrom, input.shiftTo),
    timezone: input.timezone ?? "Asia/Kolkata",
    laptop: normalizeLaptop(input.laptop),
    paidLeavesPerMonth: input.paidLeavesPerMonth ?? 0,
    monthlyHours: input.monthlyHours,
    weeklySchedule: input.weeklySchedule ?? "mon_fri",
    monthlyAmount: major(monthlyMinor),
    totalPrice: major(totalMinor),
    hourlyRate: major(input.hourlyRateMinor),
    perHireCharge: major(input.perHireMinor),
    candidateScore: input.candidateScore ?? null,
    projectSkills: input.projectSkills ?? [],
  };
}
