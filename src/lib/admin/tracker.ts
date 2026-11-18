import { guaranteeEnded, guaranteeMisses } from "../guarantee.ts";
import { interviewLifecycle, type InterviewLifecycle } from "../interview-lifecycle.ts";
import { parseOffer } from "../offer.ts";
import { effectiveProposalStatus, expiryOf, type ExpiryReason } from "../proposal-expiry.ts";

/**
 * Proposal tracker filters (legacy admin-proposal-tracker.tsx), as pure
 * functions over the loaded rows so the page, its stat cards and the CSV
 * agree. ADP-12: an exact company and candidate (by id, not a name match)
 * and a timezone filter. Legacy's "sent" label and client-side "expiry"
 * guess are deliberately not ported.
 */

export type TrackerFilters = {
  from: Date | null;
  to: Date | null;
  company: string;
  intern: string;
  tz: string;
};

export type ProposalRow = {
  id: string;
  status: string;
  flowType: string | null;
  currency: string | null;
  offerDetails: unknown;
  createdAt: Date | null;
  hiredAt: Date | null;
  internId: string;
  employerId: string;
  projectTimezone: string | null;
};

/**
 * Every proposal with its TRUE status: an offer past its start day that was never answered or paid reads `expired` before the
 * sweep has run (same rule as the Expired tab and the intern's own page). `storedStatus` keeps what the database says, because
 * the row's actions (withdraw, edit) still follow that.
 */
export function withTrueProposalStatus<P extends { id: string; status: string; hiredAt: Date | string | null; offerDetails: unknown; currency: string | null }>(
  rows: P[],
  now: Date,
  openOrderIds: ReadonlySet<string> = new Set(),
): (P & { storedStatus: string })[] {
  return rows.map((p) => ({
    ...p,
    storedStatus: p.status,
    status: effectiveProposalStatus({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, currency: p.currency, hasOpenOrder: p.status === "accepted" && openOrderIds.has(p.id) }, now),
  }));
}

/** Every interview with its true status (interview-lifecycle.ts): a meeting whose time passed unmarked reads `expired`, never `scheduled`. */
export function withTrueInterviewStatus<I extends { status: string; slot1: Date | null; slot2: Date | null; slot3: Date | null; selectedSlot: number | null; employerId: string; isAi?: boolean }>(
  rows: I[],
  now: number,
): (I & { storedStatus: string; lifecycle: InterviewLifecycle })[] {
  return rows.map((i) => {
    const lifecycle = interviewLifecycle(i, now);
    return { ...i, storedStatus: i.status, status: lifecycle.status || i.status, lifecycle };
  });
}

/** Interviews still to come: a booked slot in the future. The page header's count and the Scheduled status filter share it. */
export function upcomingInterviewCount(rows: { lifecycle: InterviewLifecycle; slot1: Date | null; slot2: Date | null; slot3: Date | null; selectedSlot: number | null }[], now: number): number {
  return rows.filter((i) => {
    const s = i.selectedSlot === 1 ? i.slot1 : i.selectedSlot === 2 ? i.slot2 : i.selectedSlot === 3 ? i.slot3 : null;
    return i.lifecycle.state === "upcoming" && s !== null && s.getTime() > now;
  }).length;
}

export type InterviewRow = {
  id: string;
  status: string;
  createdAt: Date | null;
  internId: string;
  employerId: string;
  timezone: string | null;
};

/** `YYYY-MM-DD` → Date in IST, or null. `endOfDay` makes the "to" bound inclusive. */
export function parseIstDay(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The timezone an offer runs in: the offer's own, the full-time block's, else the project's. */
export function proposalTimezone(p: Pick<ProposalRow, "offerDetails" | "currency" | "projectTimezone">): string | null {
  const offer = parseOffer(p.offerDetails, p.currency);
  return offer.fullTime?.timezone || offer.timezone || p.projectTimezone || null;
}

function inRange(d: Date | null, f: TrackerFilters) {
  return (!f.from || (d !== null && d >= f.from)) && (!f.to || (d !== null && d <= f.to));
}

export function filterProposals<P extends ProposalRow>(rows: P[], f: TrackerFilters): P[] {
  return rows.filter(
    (p) =>
      inRange(p.createdAt, f) &&
      (!f.company || p.employerId === f.company) &&
      (!f.intern || p.internId === f.intern) &&
      (!f.tz || proposalTimezone(p) === f.tz),
  );
}

export function filterInterviews<I extends InterviewRow>(rows: I[], f: TrackerFilters): I[] {
  return rows.filter(
    (i) =>
      inRange(i.createdAt, f) &&
      (!f.company || i.employerId === f.company) &&
      (!f.intern || i.internId === f.intern) &&
      (!f.tz || (i.timezone || "Asia/Kolkata") === f.tz),
  );
}

/** Every word must appear in one of the fields (legacy search rule). */
export function matchesSearch(fields: (string | null | undefined)[], q: string): boolean {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).map((s) => String(s).toLowerCase());
  return words.every((w) => hay.some((h) => h.includes(w)));
}

export function paginate<T>(rows: T[], page: number, perPage: number): { rows: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * perPage, p * perPage), page: p, pages, total: rows.length };
}

export function sortBy<T>(rows: T[], key: (r: T) => string | number | null, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * sign;
  });
}

/**
 * Interns the pipeline flags "Not eligible for guarantee". Takes every one of
 * the intern's proposals (not the date-filtered page rows) and the same
 * `guaranteeEnded` the intern's offer screens use, so the two always agree.
 */
export function ineligibleInterns(
  proposals: { internId: string; status: string; offerDetails: unknown; currency: string | null }[],
  extraByIntern: Map<string, unknown>,
  now: Date = new Date(),
): Set<string> {
  const byIntern = new Map<string, typeof proposals>();
  for (const p of proposals) byIntern.set(p.internId, [...(byIntern.get(p.internId) ?? []), p]);
  const out = new Set<string>();
  for (const [id, rows] of byIntern) if (guaranteeEnded(extraByIntern.get(id), guaranteeMisses(rows, now))) out.add(id);
  return out;
}

/**
 * Expired offers (the pipeline's Expired tab, its CSV and the Reports card). ONE definition: `expiryOf`
 * (proposal-expiry.ts), computed on read so an offer the sweeper has not yet written still shows, plus
 * status `withdrawn` (which expiryOf does not know: a withdrawn offer is a closure, not a lapse).
 *
 * Headline ("Expired" count): the three reasons where the offer lapsed on its own or was lost to another
 * offer. `admin_closed` and `withdrawn` are deliberate closures by a person: own chips, never in the headline.
 *
 * Expiry time: the stored `expiredAt`, else the start-day boundary (computed rows). A legacy `expired` row with
 * no stamp, and `withdrawn`, have no event time of their own: `updated_at` stands in and the row is marked
 * `atApprox`. Open order: the loader passes the proposal ids with an unpaid order inside its 30-minute window
 * (the sweeper's own freeze rule); without it an in-checkout offer would read as expired.
 */
export const HEADLINE_REASONS: ExpiryReason[] = ["no_reply_past_start", "unpaid_past_start", "accepted_elsewhere"];
export const EXPIRED_REASONS: ExpiryReason[] = [...HEADLINE_REASONS, "admin_closed", "withdrawn"];

export type ExpiredSource = {
  id: string;
  status: string;
  currency: string | null;
  offerDetails: unknown;
  hiredAt: Date | null;
  updatedAt: Date | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  employerId: string;
  companyName: string | null;
  projectId: string;
  projectName: string | null;
  projectTimezone: string | null;
};

export type ExpiredRow<S extends ExpiredSource = ExpiredSource> = S & {
  reason: ExpiryReason;
  /** When it expired; null when no time is known. */
  at: Date | null;
  /** `at` is the row's last update, not an event time. */
  atApprox: boolean;
  /** The sweeper (or an admin) already wrote status `expired`; false = computed on read. */
  persisted: boolean;
};

export function expiredProposals<S extends ExpiredSource>(rows: S[], now: Date, openOrderIds: ReadonlySet<string> = new Set()): ExpiredRow<S>[] {
  const out: ExpiredRow<S>[] = [];
  for (const p of rows) {
    if (p.hiredAt) continue;
    if (p.status === "withdrawn") {
      out.push({ ...p, reason: "withdrawn", at: p.updatedAt, atApprox: true, persisted: true });
      continue;
    }
    const e = expiryOf({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, currency: p.currency, hasOpenOrder: p.status === "accepted" && openOrderIds.has(p.id) }, now);
    if (!e.expired || !e.reason) continue;
    const stored = e.at ? new Date(e.at) : null;
    const approx = p.status === "expired" && !stored;
    out.push({ ...p, reason: e.reason, at: stored ?? (approx ? p.updatedAt : null), atApprox: approx && p.updatedAt !== null, persisted: p.status === "expired" });
  }
  return out;
}

export type ExpiredFilters = {
  reason: string;
  q: string;
  company: string;
  intern: string;
  tz: string;
  /** Expiry time range: since inclusive, until exclusive. */
  since: Date | null;
  until: Date | null;
};

/** The Expired tab's, the CSV's and the Reports card's filters from one URL bag. `from`/`to` are IST days of the EXPIRY (to is the whole day). */
export function parseExpiredFilters(params: Record<string, string | undefined>): ExpiredFilters {
  const to = parseIstDay(params.to, true);
  return {
    reason: (EXPIRED_REASONS as string[]).includes(params.reason ?? "") ? (params.reason as string) : "",
    q: (params.q ?? "").trim(),
    company: params.company ?? "",
    intern: params.intern ?? "",
    tz: params.tz ?? "",
    since: parseIstDay(params.from),
    until: to ? new Date(to.getTime() + 1) : null,
  };
}

const nameOfExpired = (r: ExpiredSource) => `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim();

/** Applies every filter; the Expired tab's chip counts run this with `reason` cleared. */
export function filterExpired<R extends ExpiredRow>(rows: R[], f: ExpiredFilters): R[] {
  return rows.filter(
    (r) =>
      (!f.reason || r.reason === f.reason) &&
      (!f.company || r.employerId === f.company) &&
      (!f.intern || r.internId === f.intern) &&
      (!f.tz || proposalTimezone({ offerDetails: r.offerDetails, currency: r.currency, projectTimezone: r.projectTimezone }) === f.tz) &&
      ((!f.since && !f.until) || (r.at !== null && (!f.since || r.at >= f.since) && (!f.until || r.at < f.until))) &&
      matchesSearch([nameOfExpired(r), r.internEmail, r.companyName, r.projectName], f.q),
  );
}

export function expiredCounts(rows: { reason: ExpiryReason }[]): Record<ExpiryReason, number> {
  const out = Object.fromEntries(EXPIRED_REASONS.map((r) => [r, 0])) as Record<ExpiryReason, number>;
  for (const r of rows) out[r.reason] += 1;
  return out;
}

export const headlineCount = (c: Record<ExpiryReason, number>) => HEADLINE_REASONS.reduce((n, r) => n + c[r], 0);

/** What the tracker's cards already show of an offer: start day, and the monthly amount (internship) or CTC (full-time), in minor units. */
export function offerFacts(p: { offerDetails: unknown; currency: string | null }): { startDay: string | null; fullTime: boolean; amountMinor: number | null; months: number | null; currency: string } {
  const o = parseOffer(p.offerDetails, p.currency);
  return {
    startDay: o.startDate ? String(o.startDate).slice(0, 10) : null,
    fullTime: Boolean(o.fullTime),
    amountMinor: o.fullTime ? o.fullTime.annualCtcMinor : o.monthlyMinor,
    months: o.fullTime ? null : o.months,
    currency: o.currency,
  };
}
