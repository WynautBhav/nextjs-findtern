import { isHiredProposal } from "./hire-status.ts";
import { monthsOf, offerPastStart, parseOffer, todayIst } from "./offer.ts";

/**
 * One offer at a time. An intern is HELD (not offerable by any other company, hidden from them, unable to accept a
 * second internship) while they have either
 *  (a) an offer in `accepted` (awaiting payment) or `processing` that has not lapsed, or
 *  (b) a hire (isHiredProposal) that is still running or upcoming: not ended early (`endedAt`), and either full-time,
 *      undated, or whose internship (start date + months) has not finished yet.
 * It is a pure function of the intern's current proposal rows, so nothing is ever reset: when the offer is declined,
 * withdrawn, expired (incl. the unpaid-past-start sweeper), closed by staff, or the hire ends, the hold is simply gone.
 *
 * Deliberately NOT here: an open payment order. An accepted offer whose start day has begun releases the intern even if an
 * order is open (the order route's pay gate decides that offer on its own), because the SQL twin (employer-visibility.ts
 * heldElsewhereSql) cannot see orders and the two must agree.
 *
 * Imports are relative `.ts` so this runs under plain `node --test`. The SQL twin lives in employer-visibility.ts.
 */

export type HoldRow = {
  employerId?: string | null;
  status: string | null;
  hiredAt?: Date | string | null;
  endedAt?: Date | string | null;
  offerDetails: unknown;
  currency?: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day an internship of `months` months starting on `startDay` finishes (exclusive), clamped to the month end like Postgres. */
export function internshipEndDay(startDay: string, months: number): string | null {
  if (!DAY.test(startDay)) return null;
  const [y, m, d] = startDay.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.toISOString().slice(0, 10) !== startDay) return null;
  const target = m - 1 + months;
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10);
}

/** A hire that still occupies the intern: full-time always, missing/invalid dates hold, otherwise until the internship's end day. */
export function hireIsRunning(row: HoldRow, now: Date = new Date()): boolean {
  if (!isHiredProposal({ status: row.status, hiredAt: row.hiredAt })) return false;
  if (row.endedAt) return false;
  const offer = parseOffer(row.offerDetails, row.currency);
  if (offer.fullTime) return true;
  const end = offer.startDate ? internshipEndDay(offer.startDate.slice(0, 10), monthsOf(offer.duration)) : null;
  if (!end) return true;
  return todayIst(now) < end;
}

/** An offer the intern accepted that is waiting for payment and has not lapsed (`processing` never lapses: money is in flight). */
export function acceptedOfferHolds(row: HoldRow, now: Date = new Date()): boolean {
  if (isHiredProposal({ status: row.status, hiredAt: row.hiredAt })) return false;
  if (row.status === "processing") return true;
  if (row.status !== "accepted") return false;
  return !offerPastStart(parseOffer(row.offerDetails, row.currency).startDate, now);
}

/** Does this one proposal row hold its intern? */
export function rowHoldsIntern(row: HoldRow, now: Date = new Date()): boolean {
  return acceptedOfferHolds(row, now) || hireIsRunning(row, now);
}

/** Is the intern held by any of their rows? */
export function internHeld(rows: HoldRow[], now: Date = new Date()): boolean {
  return rows.some((r) => rowHoldsIntern(r, now));
}

/** Is the intern held by a row of a company other than `employerId`? The employer's own relationship is handled by the existing per-employer rules. */
export function heldElsewhere(rows: HoldRow[], employerId: string, now: Date = new Date()): boolean {
  return rows.some((r) => r.employerId !== employerId && rowHoldsIntern(r, now));
}

/** The neutral refusal every sender path uses: never names the company, dates or pay. */
export const CANDIDATE_UNAVAILABLE = { error: "This candidate is no longer available.", code: "candidate_unavailable" } as const;

/** The accept path's refusal copy (the intern sees their own situation, no company named). */
export const ALREADY_LINED_UP = "You already have an internship lined up. Only one at a time.";
