import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { shortDate } from "../format.ts";
import { toInrMinor } from "./money.ts";

/**
 * The one money layer for the admin console (Orders, Intern invoices,
 * Transactions, Reports, Reports/Money, Dashboard). Pure: no DB, no React.
 * The loaders that run these over the database live in `receivables-load.ts`.
 *
 * DECISIONS (3 Nov 2026)
 *
 * PAID. A payment is paid when its row in `employer_payments` or
 * `intern_payments` has `status = 'paid'`. That is the ledger of record:
 * `settleEmployerOrder` / `settleInternOrder` (lib/payments.ts) write it for
 * Razorpay and for free (100% code, `gateway = 'free'`, amount 0) alike, and
 * they take the invoice number in the same transaction. Free rows are paid
 * but add 0 to every total.
 *   Wrong before: Intern invoices "Collected" also counted flag-only rows
 *   (interns whose `extraData.payment.isPaid` is true with no paid payment
 *   row, synthesised as status "paid"). Those have no settlement record, no
 *   invoice and no gateway reference, and the other four pages never counted
 *   them, so Collected could not reconcile with Transactions. They are still
 *   listed ("Marked paid") but are not money received.
 *
 * RECEIVED / COLLECTED. The INR sum of paid rows, USD at the business rate
 * (money.ts, ₹100 = $1). Test employers (the internal "admin" employer and
 * the AI-interview employer) are not customers and are excluded everywhere;
 * the Dashboard, Reports and Transactions used to include them while Money
 * excluded them. A paid row's moment is `coalesce(paid_at, created_at)`:
 * Reports used `paid_at` only (silently dropping legacy rows with no paid_at
 * from the period total) while Money used `paid_at ?? created_at`.
 *
 * DISCOUNTS. The promo discount recorded on a paid, counted row, in INR.
 *
 * OWED (to interns). Money Findtern has committed to pay interns and has not
 * yet: payouts recorded as pending plus stipend months not yet queued (the
 * Money page's "Owed to interns"). PAID OUT is payouts with status 'paid'.
 *
 * NET = received - paidOut - owed.
 *
 * DAYS AND MONTHS are India (Asia/Kolkata, UTC+5:30, no DST) calendar days and
 * months, in SQL and in TypeScript alike. Timestamps are stored as UTC clock
 * time without a zone. Chart keys used to come from the server's local
 * `new Date(y, m, d)` while SQL bucketed in IST, so on a UTC host the last
 * 5.5 hours of every IST day, and the first 5.5 hours of every IST month,
 * landed in the neighbouring bucket.
 */

export const PAID_STATUS = "paid";

/**
 * College-drive waivers (gateway 'college_drive', amount 0, status 'paid') mark
 * a fee as covered; no money moved and no invoice exists. They are not receipts.
 */
export const DRIVE_WAIVER_GATEWAY = "college_drive";
export const isMoneyReceived = (p: { gateway?: string | null }) => p.gateway !== DRIVE_WAIVER_GATEWAY;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- IST time

type When = Date | string | number;

function istParts(when: When): { y: number; m: number; d: number } | null {
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return null;
  const s = new Date(t + IST_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of the India calendar day containing the instant; null if unparseable. */
export function istDayKey(when: When | null | undefined): string | null {
  if (when == null) return null;
  const p = istParts(when);
  return p ? `${p.y}-${p2(p.m)}-${p2(p.d)}` : null;
}

/** `YYYY-MM` of the India calendar month containing the instant; null if unparseable. */
export function istMonthKey(when: When | null | undefined): string | null {
  const day = istDayKey(when);
  return day ? day.slice(0, 7) : null;
}

/** The instant an India day (`YYYY-MM-DD`) begins. */
export function istDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

/** The instant an India month (`YYYY-MM`) begins. */
export function istMonthStart(month: string): Date {
  return istDayStart(`${month}-01`);
}

/** The last `n` India days ending today, oldest first, as `YYYY-MM-DD`. */
export function istDayKeys(now: When, n: number): string[] {
  const p = istParts(now);
  if (!p) return [];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(p.y, p.m - 1, p.d - (n - 1) + i)).toISOString().slice(0, 10));
}

/** The last `n` India months ending this month, oldest first, as `YYYY-MM`. */
export function istMonthKeys(now: When, n: number): string[] {
  const p = istParts(now);
  if (!p) return [];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(p.y, p.m - 1 - (n - 1) + i, 1)).toISOString().slice(0, 7));
}

/** "Mon" for a `YYYY-MM-DD` key. */
export function istWeekdayLabel(day: string): string {
  return shortDate(new Date(`${day}T06:00:00Z`), { weekday: "short" });
}

/** "Nov" for a `YYYY-MM` key. */
export function istMonthLabel(month: string): string {
  return shortDate(new Date(`${month}-15T06:00:00Z`), { month: "short" });
}

/**
 * A `from` / `to` pair of India dates (inclusive) as instants: `since` is the
 * start of `from`, `until` the start of the day after `to`. Anything that is
 * not `YYYY-MM-DD` is ignored.
 */
export function istDateRange(from: string | undefined, to: string | undefined): { since: Date | null; until: Date | null } {
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const f = ok(from);
  const t = ok(to);
  return { since: f ? istDayStart(f) : null, until: t ? new Date(istDayStart(t).getTime() + DAY_MS) : null };
}

// ----------------------------------------------------------------- buckets

export type Receipt = { at: When | null | undefined; amountMinor: number; currency?: string | null };
export type Bucket = { totalMinor: number; count: number };

function bucketBy(rows: Receipt[], key: (when: When | null | undefined) => string | null): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  for (const r of rows) {
    const k = key(r.at);
    if (!k) continue;
    const hit = out.get(k) ?? { totalMinor: 0, count: 0 };
    hit.totalMinor += toInrMinor(r.amountMinor, r.currency);
    hit.count += 1;
    out.set(k, hit);
  }
  return out;
}

/** Receipts summed (INR) and counted per India day. */
export const bucketByIstDay = (rows: Receipt[]) => bucketBy(rows, istDayKey);

/** Receipts summed (INR) and counted per India month. */
export const bucketByIstMonth = (rows: Receipt[]) => bucketBy(rows, istMonthKey);

/** A college seat batch as stored (the loader selects these columns). */
export type CollegeBatchRow = { id: string; collegeId: string; status: string; amountMinor: number; invoiceNumber?: string | null; referenceId?: string | null; paidAt?: When | null; createdAt?: When | null };

/**
 * Paid college seat batches as receipts (INR, at the paid moment, `created_at` when a legacy row has no
 * `paid_at`). Pending and void batches are not money received. College seat sales are customers' money
 * like employer orders: they count in Collected, the Reports ledger, analytics revenue and the Payments CSV.
 */
export function collegeBatchReceipts(rows: CollegeBatchRow[]): (Receipt & { id: string; collegeId: string; invoiceNumber: string | null; referenceId: string | null })[] {
  return rows
    .filter((r) => r.status === PAID_STATUS)
    .map((r) => ({ id: r.id, collegeId: r.collegeId, at: r.paidAt ?? r.createdAt, amountMinor: r.amountMinor, currency: "INR", invoiceNumber: r.invoiceNumber ?? null, referenceId: r.referenceId ?? null }));
}

/** Zero-filled series over `keys`, so a chart has no gaps. Keys outside `keys` are dropped. */
export function fillBuckets(keys: string[], buckets: ReadonlyMap<string, Bucket>): (Bucket & { key: string })[] {
  return keys.map((key) => ({ key, totalMinor: buckets.get(key)?.totalMinor ?? 0, count: buckets.get(key)?.count ?? 0 }));
}

// ------------------------------------------------------------------ totals

export type LedgerRow = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  discountMinor?: number | null;
  /** Marked paid only by the profile flag: listed, never counted as money. */
  flagOnly?: boolean;
};

export const isPaid = (r: Pick<LedgerRow, "status">) => r.status === PAID_STATUS;

/**
 * Collected, discounts and not-collected over invoice-style rows (Orders,
 * Intern invoices). `uncounted` are row ids that are listed but are not
 * customers' money (test employers).
 */
export function ledgerTotals(rows: LedgerRow[], uncounted?: ReadonlySet<string>) {
  let collectedMinor = 0;
  let collectedCount = 0;
  let discountMinor = 0;
  let notCollectedMinor = 0;
  let notCollectedCount = 0;
  let markedPaidCount = 0;
  for (const r of rows) {
    if (r.flagOnly) {
      markedPaidCount += 1;
      continue;
    }
    if (uncounted?.has(r.id)) continue;
    if (isPaid(r)) {
      collectedMinor += toInrMinor(r.amountMinor, r.currency);
      discountMinor += toInrMinor(r.discountMinor ?? 0, r.currency);
      collectedCount += 1;
    } else {
      notCollectedMinor += toInrMinor(r.amountMinor, r.currency);
      notCollectedCount += 1;
    }
  }
  return { collectedMinor, collectedCount, discountMinor, notCollectedMinor, notCollectedCount, markedPaidCount };
}

/** Net position: money received less money paid out and still owed to interns. */
export function netMinor(t: { receivedMinor: number; paidOutMinor: number; owedMinor: number }): number {
  return t.receivedMinor - t.paidOutMinor - t.owedMinor;
}

// --------------------------------------------------------------------- SQL

/** The moment a paid row counts from. Pass the row's `paid_at` and `created_at` columns. */
export function receivedAtSql(paidAt: SQLWrapper, createdAt: SQLWrapper): SQL<Date> {
  return sql<Date>`coalesce(${paidAt}, ${createdAt})`;
}

/** `YYYY-MM-DD` or `YYYY-MM` of an India day / month, from a UTC timestamp column. */
export function istKeySql(col: SQLWrapper, unit: "day" | "month"): SQL<string> {
  return sql<string>`to_char((${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'), ${unit === "day" ? "YYYY-MM-DD" : "YYYY-MM"})`;
}

/** An instant as a bindable UTC timestamp (the columns are `timestamp` without zone, holding UTC). */
export function utcSql(at: Date): SQL {
  return sql`${at.toISOString()}::timestamp`;
}
