import { parseOffer } from "../offer.ts";

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
