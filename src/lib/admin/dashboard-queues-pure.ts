import { lineCharge } from "../checkout.ts";
import { shortDate } from "../format.ts";
import { parseOffer } from "../offer.ts";
import { attentionTotal } from "./dashboard.ts";
import { toInrMinor } from "./money.ts";
import { istDayKey } from "./revenue.ts";
import type { MoneyStuck, QueueGroup, QueueKey, QueueRecord } from "./dashboard-queues.types.ts";

/**
 * Pure helpers behind the dashboard's triage queues (grouping, ordering, ages,
 * offer values, totals). No database and no `@/` imports, so node:test can run
 * them; the loader is `dashboard-queues.ts`.
 */

export const DAY_MS = 86_400_000;
/** Records shown per queue; the true count can be larger. */
export const RECORD_CAP = 6;

/** The queues, in the rail's order: calendar first, then money, meetings, scores, the rest. */
export const QUEUE_ORDER: QueueKey[] = ["calendar", "payouts", "nolink", "unscored", "messages", "accepted", "sheets"];

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** "Ira Zugwwsv": first and last trimmed and joined; the fallback when both are empty. */
export function fullName(first: string | null | undefined, last: string | null | undefined, fallback = "Candidate"): string {
  return `${clean(first)} ${clean(last)}`.trim() || fallback;
}

/** One line cut to `max` characters with an ellipsis; whitespace collapsed. */
export function truncate(text: string | null | undefined, max = 80): string {
  const one = clean(text).replace(/\s+/g, " ");
  return one.length <= max ? one : `${one.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Joins the non-empty parts: "Brightwell US · November". */
export function joinParts(...parts: (string | null | undefined)[]): string {
  return parts.map(clean).filter(Boolean).join(" · ");
}

/** Whole days from `from` to `now`, never negative; null when `from` is missing or not a date. */
export function ageInDays(from: Date | string | null | undefined, now: Date): number | null {
  if (from == null) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The leading `YYYY-MM-DD` of a stored due date, or null if it is not a real one. */
export function dueDay(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return DAY_KEY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

/**
 * How many India days a due date is overdue by: 0 on the day and before it (due
 * later), null when there is no usable date.
 */
export function overdueDays(due: unknown, now: Date): number | null {
  const day = dueDay(due);
  const today = istDayKey(now);
  if (!day || !today) return null;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS));
}

/** An India day key as an instant to show ("5 Nov"); null when not a real day. */
export function dueLabel(due: unknown): string | null {
  const day = dueDay(due);
  return day ? shortDate(new Date(`${day}T06:00:00Z`), { day: "numeric", month: "short" }) : null;
}

/** ISO timestamp for a Date, or null. */
export function isoOrNull(d: Date | null | undefined): string | null {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * What an employer owes for an accepted offer, in INR minor units: the same
 * charge checkout makes (lib/checkout `lineCharge`, upfront: the engagement
 * plus the hiring fee, or the full-time fee), USD converted at the business
 * rate. Null when the offer carries no price (an unparseable or empty
 * `offerDetails`), never 0.
 */
export function offerAmountMinorInr(offerDetails: unknown, currency?: string | null): number | null {
  if (!offerDetails || typeof offerDetails !== "object" || Array.isArray(offerDetails)) return null;
  const offer = parseOffer(offerDetails, currency);
  const priced = offer.fullTime ? (offer.fullTime.annualCtcMinor ?? 0) > 0 : (offer.totalMinor ?? 0) > 0 || (offer.monthlyMinor ?? 0) > 0;
  if (!priced) return null;
  const total = lineCharge(offer, 0, "upfront").totalMinor;
  return total > 0 ? Math.round(toInrMinor(total, offer.currency)) : null;
}

/** Most overdue first (unknown last), then the larger amount, then id so the order is stable. */
export function comparePayouts(
  a: { ageDays: number | null; amountMinorInr: number | null; id: string },
  b: { ageDays: number | null; amountMinorInr: number | null; id: string },
): number {
  return (b.ageDays ?? -1) - (a.ageDays ?? -1) || (b.amountMinorInr ?? 0) - (a.amountMinorInr ?? 0) || a.id.localeCompare(b.id);
}

/** Longest waiting first (unknown last), then the larger amount, then id. */
export function compareStuck(
  a: { ageDays: number | null; amountMinorInr: number | null; id: string },
  b: { ageDays: number | null; amountMinorInr: number | null; id: string },
): number {
  return comparePayouts(a, b);
}

/** Soonest first; a missing time goes last. */
export function compareWhen(a: { when: string | null; id: string }, b: { when: string | null; id: string }): number {
  const ta = a.when ? Date.parse(a.when) : Infinity;
  const tb = b.when ? Date.parse(b.when) : Infinity;
  return (ta === tb ? 0 : ta < tb ? -1 : 1) || a.id.localeCompare(b.id);
}

/** Orders then caps: the first `cap` (6) of the most urgent. */
export function topRecords<T>(rows: T[], compare: (a: T, b: T) => number, cap = RECORD_CAP): T[] {
  return [...rows].sort(compare).slice(0, cap);
}

/** Owed by employers: sums the priced offers; unparseable ones are counted but add nothing. */
export function totalOwed(offers: { amountMinorInr: number | null }[]): Pick<MoneyStuck, "owedByEmployersMinor" | "employerOfferCount"> {
  let owed = 0;
  for (const o of offers) if (o.amountMinorInr != null && Number.isFinite(o.amountMinorInr)) owed += Math.max(0, o.amountMinorInr);
  return { owedByEmployersMinor: owed, employerOfferCount: offers.length };
}

/** Records grouped by queue (every queue present), each id prefixed with its queue so it is unique across groups. */
export function groupByQueue(records: QueueRecord[]): Record<QueueKey, QueueRecord[]> {
  const out = Object.fromEntries(QUEUE_ORDER.map((k) => [k, [] as QueueRecord[]])) as Record<QueueKey, QueueRecord[]>;
  for (const r of records) out[r.queue].push(r);
  return out;
}

/** A queue that failed: count 0 and no records, flagged so it is never read as "all clear". */
export function failedGroup(group: Omit<QueueGroup, "count" | "fresh" | "records" | "error">): QueueGroup {
  return { ...group, count: 0, fresh: 0, records: [], error: true };
}

/**
 * The hero number, by the same rule as `attentionTotal` in lib/admin/dashboard.
 * A failed queue adds nothing (it is shown as an error, not as zero).
 */
export function totalOf(groups: Pick<QueueGroup, "count" | "fresh" | "error">[]): { total: number; fresh: number } {
  return attentionTotal(groups.filter((g) => !g.error));
}
