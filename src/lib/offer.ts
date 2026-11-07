import { INR_PER_USD } from "./currency.ts";
import { isKnownTimezone } from "./timezones.ts";

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
  /** "Additional information" the employer added to the offer; empty when none. */
  additionalInfo: string;
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
  /** Fixed monthly intern stipend (INR paise), set when sent. Null on older offers, which use the 50% rule. */
  internStipendMinor: number | null;
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

// A real 0 (a no-stipend internship) must survive, unlike the other amounts.
const toMinorKeepZero = (major: unknown) => {
  const n = num(major);
  return n != null && n >= 0 ? Math.round(n * 100) : null;
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
  // Any other stored value is free text the other side would read verbatim.
  return "Not specified";
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
    additionalInfo: str(o.additionalInfo).trim(),
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
    monthlyMinor: toMinorKeepZero(o.monthlyAmount ?? o.monthly_amount),
    totalMinor: toMinor(o.totalPrice),
    hourlyRateMinor: toMinorKeepZero(o.hourlyRate),
    internStipendMinor: toMinorKeepZero(o.internStipendMonthly),
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

/** Fixed monthly intern stipend by score band (INR paise): 6-8 ₹8,000, 8+ ₹15,000, else none. */
export function fixedInternStipendInrMinor(score: number | null | undefined): number | null {
  const s = Number(score ?? 0);
  return s >= 8 ? 1_500_000 : s >= 6 ? 800_000 : null;
}

/**
 * The stipend the intern sees, always in INR minor units. An offer sent with a
 * fixed stipend returns it as is. Older offers (legacy rule: USD converted):
 * half of the employer's monthly amount, rounded down, and 0 for a candidate
 * scored below 6. Null when the offer has no monthly amount.
 */
export function internStipendInrMinor(offer: Offer, score?: number | null): number | null {
  if (offer.internStipendMinor != null) return offer.internStipendMinor;
  if (offer.monthlyMinor == null) return null;
  if (!stipendEligible(score)) return 0;
  const inr = offer.currency === "USD" ? offer.monthlyMinor * INR_PER_USD : offer.monthlyMinor;
  return Math.floor(inr * INTERN_STIPEND_SHARE);
}

/** Today's date in India (YYYY-MM-DD) - offers are dated in IST. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** "2026-13-45" and "2026-02-30" look like dates but are not. */
export function isRealDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === day;
}

/** The day `days` after the IST day `from` ("2026-11-01" + 365). */
export function addDays(from: string, days: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The longest shift an intern can be offered: nobody works more than 8 hours a day. */
export const MAX_SHIFT_MINUTES = 8 * 60;

const clockMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** Length of a shift between two "HH:MM" times; an end before the start runs past midnight. */
export function shiftMinutes(from: string, to: string): number {
  return (clockMinutes(to) - clockMinutes(from) + 1440) % 1440;
}

/** The latest end for a shift starting at `from` ("09:00" -> "17:00"). */
export function latestShiftEnd(from: string): string {
  const m = (clockMinutes(from) + MAX_SHIFT_MINUTES) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:30": a 24-hour clock time. */
export function isClockTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/**
 * Legacy rule (proposals.tsx:483): an offer can be answered only while its
 * start date is still ahead. On the start day it reads as expired.
 */
export function offerPastStart(startDate: string | null | undefined, now: Date = new Date()): boolean {
  const day = String(startDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayIst(now);
}

/**
 * How long an intern has left to answer, as the sheet words it ("3 days left",
 * "20 hours left", "45 min left"). The offer closes when its start day begins in
 * India (offerPastStart), so that is the moment counted down to. Null once it has
 * closed or when there is no start date.
 */
export function offerTimeLeft(startDate: string | null | undefined, now: Date = new Date()): string | null {
  const day = String(startDate ?? "").slice(0, 10);
  if (!isRealDay(day)) return null;
  const ms = Date.parse(`${day}T00:00:00+05:30`) - now.getTime();
  if (!(ms > 0)) return null;
  const hours = ms / 3_600_000;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  if (hours >= 1) {
    const h = Math.floor(hours);
    return `${h} hour${h === 1 ? "" : "s"} left`;
  }
  return `${Math.max(1, Math.ceil(ms / 60_000))} min left`;
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
  additionalInfo?: string;
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
  const fixedStipend = fixedInternStipendInrMinor(input.candidateScore);
  return {
    roleTitle: input.roleTitle,
    jd: jdToHtml(jdToText(input.jd ?? "")),
    ...(input.additionalInfo?.trim() ? { additionalInfo: input.additionalInfo.trim() } : {}),
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
    // A scored candidate below 6 is stored as 0, not left off: with the key
    // missing a later score of 6+ would read this offer as the old 50% rule.
    // Only offers made before this (no key) are grandfathered; unscored stays
    // unstored (not penalised, see stipendEligible).
    ...(fixedStipend != null
      ? { internStipendMonthly: major(fixedStipend) }
      : !stipendEligible(input.candidateScore)
        ? { internStipendMonthly: 0 }
        : {}),
    perHireCharge: major(input.perHireMinor),
    candidateScore: input.candidateScore ?? null,
    projectSkills: input.projectSkills ?? [],
  };
}

/** How far ahead an offer start or an interview slot may be. */
export const MAX_DAYS_AHEAD = 365;

/**
 * The start-date, shift and timezone rules shared by the composer and the
 * offer edit. Pass only what is being set; each issue names its field.
 */
export function offerTermIssues(t: {
  startDate?: string;
  shiftFrom?: string;
  shiftTo?: string;
  timezone?: string;
}): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  if (t.startDate !== undefined) {
    if (!isRealDay(t.startDate)) out.push({ path: "startDate", message: "Pick a real start date." });
    else if (t.startDate > addDays(todayIst(), MAX_DAYS_AHEAD)) out.push({ path: "startDate", message: "Pick a start date within the next year." });
  }
  if (t.shiftFrom !== undefined || t.shiftTo !== undefined) {
    const from = t.shiftFrom ?? "";
    const to = t.shiftTo ?? "";
    // Flexible hours send "flexible" for both; otherwise both are clock times and differ.
    if (!(from === "flexible" && to === "flexible")) {
      if (from === "flexible" || to === "flexible") out.push({ path: "shiftFrom", message: "Set both the start and end time, or choose flexible hours for both." });
      else if (!isClockTime(from) || !isClockTime(to)) out.push({ path: "shiftFrom", message: "Pick the working hours." });
      else if (from === to) out.push({ path: "shiftTo", message: "The shift can't start and end at the same time." });
      else if (shiftMinutes(from, to) > MAX_SHIFT_MINUTES) {
        out.push({ path: "shiftTo", message: `A shift can't run longer than 8 hours. Starting at ${from}, the latest end is ${latestShiftEnd(from)}.` });
      }
    }
  }
  if (t.timezone !== undefined && !isKnownTimezone(t.timezone)) {
    out.push({ path: "timezone", message: "Pick a timezone from the list." });
  }
  return out;
}

/**
 * The same term rules for an edit of a stored offer, judging only what the edit changes: the form resends every
 * field, and an older offer (a shift over 8 hours, a start date now in the past, an odd timezone) may not meet
 * today's rules. An edit of one shift end is judged against the stored other end.
 */
export function offerEditTermIssues(
  edits: { startDate?: string; shiftFrom?: string; shiftTo?: string; timezone?: string },
  stored: { startDate?: unknown; shiftFrom?: unknown; shiftTo?: unknown; timezone?: unknown },
): { path: string; message: string }[] {
  const storedShift = shiftFields(String(stored.shiftFrom ?? ""), String(stored.shiftTo ?? ""));
  const changed = (v: string | undefined, was: unknown) => (v !== undefined && v !== String(was ?? "") ? v : undefined);
  const newFrom = changed(edits.shiftFrom, storedShift.shiftFrom);
  const newTo = changed(edits.shiftTo, storedShift.shiftTo);
  return offerTermIssues({
    startDate: changed(edits.startDate, stored.startDate),
    timezone: changed(edits.timezone, stored.timezone),
    ...(newFrom !== undefined || newTo !== undefined
      ? {
          shiftFrom: newFrom ?? (String(storedShift.shiftFrom) || "flexible"),
          shiftTo: newTo ?? (String(storedShift.shiftTo) || "flexible"),
        }
      : {}),
  });
}
