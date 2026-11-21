import { cache } from "react";
import { sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { SETTLED_STATUSES } from "@/lib/refund-accounting";
import { loadCollected, loadRefundedWithin, type Collected } from "@/lib/admin/receivables-load";
import { revenueAmountSql } from "@/lib/admin/revenue";
import { inrMinorSql, realEmployerId } from "@/lib/admin/scope";

import { shapeFinance, shapePayouts, type FinanceFigures, type PayGroup, type PayoutFigures, type PayoutGroup } from "./finance";
import { timed } from "./timing";
import { bucketSql, rangeSql } from "./window-sql";
import type { ReportWindow, TrendSpec } from "./window";

/**
 * SQL for the Finance tab. Definitions are the existing money layer's (lib/admin/revenue.ts): a payment's moment
 * is `coalesce(paid_at, created_at)`, test employers are excluded, USD is at INR 100 per dollar, a college-drive
 * waiver is not a receipt. Aggregates only: GROUP BY with a few dozen groups at most.
 */

const EP = schema.employerPayments;
const IP = schema.internPayments;
const settled = sql.join(SETTLED_STATUSES.map((s) => sql`${s}`), sql`, `);

/** A positive whole number at one of the keys, as a bigint (text that is not all digits is ignored, never an error). */
const num = (path: SQL) => sql`(CASE WHEN ${path} ~ '^[0-9]+$' AND ${path} <> '0' THEN (${path})::bigint END)`;

/**
 * The promo discount on a payment row, SQL twin of `paymentPromo` (lib/admin/payment-promo.ts): first positive
 * figure of raw.promo.discountMinor, raw.discountMinor, raw.discountAmountMinor, then the order notes.
 */
function discountSql(raw: SQL): SQL {
  const keys = [
    sql`${raw}->'promo'->>'discountMinor'`, sql`${raw}->>'discountMinor'`, sql`${raw}->>'discountAmountMinor'`,
    sql`${raw}->'order'->'notes'->>'discountAmountMinor'`, sql`${raw}->'notes'->>'discountAmountMinor'`,
    sql`${raw}->'order'->'notes'->>'discountMinor'`, sql`${raw}->'notes'->>'discountMinor'`,
  ];
  return sql`coalesce(${sql.join(keys.map(num), sql`, `)}, 0)`;
}

/** A promo code is recorded somewhere `paymentPromo` looks. */
function hasPromoSql(raw: SQL): SQL {
  const keys = [sql`${raw}->'promo'->>'promoCode'`, sql`${raw}->'promo'->>'code'`, sql`${raw}->>'promoCode'`, sql`${raw}->>'promo_code'`, sql`${raw}->'order'->'notes'->>'promoCode'`, sql`${raw}->'notes'->>'promoCode'`];
  return sql`(coalesce(${sql.join(keys.map((k) => sql`nullif(trim(${k}), '')`), sql`, `)}, '') <> '')`;
}

function groupSql(kind: "employer" | "intern", range: { since: Date | null; until: Date | null }): SQL {
  const t = kind === "employer" ? EP : IP;
  const real = kind === "employer" ? sql`${realEmployerId(EP.employerId)}` : sql`true`;
  const moment = sql`coalesce(${t.paidAt}, ${t.createdAt})`;
  const raw = sql`${t.raw}`;
  // Revenue, like "Received" and the trend: a payroll invoice's pass-through salary is the intern's, not Findtern's.
  return sql`SELECT ${kind} AS kind, lower(${t.status}) AS status, upper(${t.currency}) AS currency, lower(${t.gateway}) AS gateway,
      lower(coalesce(${raw}->>'paymentMethod', ${raw}->>'method', '')) AS method, (${t.amountMinor} = 0) AS zero, ${hasPromoSql(raw)} AS promo,
      count(*)::int AS count, coalesce(sum(${revenueAmountSql(t.amountMinor, t.raw)}), 0)::bigint AS amount_minor, coalesce(sum(${discountSql(raw)}), 0)::bigint AS discount_minor,
      coalesce(sum(CASE WHEN upper(${t.currency}) = 'USD' THEN 0 ELSE ${t.amountMinor} - round(${t.amountMinor}::numeric / 1.18) END), 0)::bigint AS gst_minor
    FROM ${t} WHERE ${real} AND ${rangeSql(moment, range.since, range.until)}
    GROUP BY 1, 2, 3, 4, 5, 6, 7`;
}

export type FinanceData = {
  figures: FinanceFigures;
  payouts: PayoutFigures;
  /** College seat sales received in the window (count, INR): part of Received on Money in/out. */
  college: { count: number; inrMinor: number };
  /** Received per the existing loader (employer + intern + college), same window: the reconciliation anchor. */
  received: Collected;
  receivedPrev: Collected | null;
  refundedPrevMinor: number | null;
};

const n = (v: unknown) => Number(v ?? 0);

/** Everything the glance and cycle sections need, once per request (React `cache`), in five parallel queries. */
export const loadFinance = cache(async (since: number | null, until: number | null, prevSince: number | null, prevUntil: number | null): Promise<FinanceData> => {
  const db = getDb();
  const range = { since: since === null ? null : new Date(since), until: until === null ? null : new Date(until) };
  const prev = prevSince === null ? null : { since: new Date(prevSince), until: prevUntil === null ? null : new Date(prevUntil) };
  const csb = schema.collegeSeatBatches;
  const payouts = schema.internPayouts;
  const [groups, payoutRows, college, received, refunded, receivedPrev, refundedPrev] = await Promise.all([
    timed("finance", "payment-groups", () =>
      db
        .execute(sql`${groupSql("employer", range)} UNION ALL ${groupSql("intern", range)} LIMIT 500`)
        .then((r) => (r.rows as Record<string, unknown>[]).map<PayGroup>((x) => ({
          kind: x.kind as PayGroup["kind"], status: String(x.status), currency: String(x.currency), gateway: String(x.gateway), method: String(x.method),
          zero: Boolean(x.zero), promo: Boolean(x.promo), count: n(x.count), amountMinor: n(x.amount_minor), discountMinor: n(x.discount_minor), gstMinor: n(x.gst_minor),
        }))),
    ),
    timed("finance", "payout-groups", () =>
      db
        .execute(sql`SELECT ${payouts.kind} AS kind, lower(${payouts.status}) AS status, upper(${payouts.currency}) AS currency, count(*)::int AS count, coalesce(sum(${payouts.amountMinor}), 0)::bigint AS amount_minor
          FROM ${payouts} WHERE ${rangeSql(sql`coalesce(${payouts.paidAt}, ${payouts.createdAt})`, range.since, range.until)} GROUP BY 1, 2, 3 LIMIT 100`)
        .then((r) => (r.rows as Record<string, unknown>[]).map<PayoutGroup>((x) => ({ kind: String(x.kind), status: String(x.status), currency: String(x.currency), count: n(x.count), amountMinor: n(x.amount_minor) }))),
    ),
    timed("finance", "college-seats", () =>
      db
        .execute(sql`SELECT count(*)::int AS count, coalesce(sum(${csb.amountMinor}), 0)::bigint AS minor FROM ${csb}
          WHERE ${csb.status} = 'paid' AND ${rangeSql(sql`coalesce(${csb.paidAt}, ${csb.createdAt})`, range.since, range.until)}`)
        .then((r) => ({ count: n(r.rows[0]?.count), inrMinor: n(r.rows[0]?.minor) })),
    ),
    timed("finance", "received", () => loadCollected(range)),
    timed("finance", "refunded", () => loadRefundedWithin(range)),
    prev ? timed("finance", "received-prev", () => loadCollected(prev)) : Promise.resolve(null),
    prev ? timed("finance", "refunded-prev", () => loadRefundedWithin(prev)) : Promise.resolve(null),
  ]);
  return {
    figures: shapeFinance(groups, { refundedMinor: refunded }),
    payouts: shapePayouts(payoutRows),
    college,
    received,
    receivedPrev,
    refundedPrevMinor: refundedPrev,
  };
});

/** Stable arguments for the cached loader (dates as numbers: `cache` compares by identity). */
export const financeFor = (w: ReportWindow) => loadFinance(w.since?.getTime() ?? null, w.until?.getTime() ?? null, w.prevSince?.getTime() ?? null, w.prevUntil?.getTime() ?? null);

export type TrendRow = { key: string; employerMinor: number; internMinor: number; collegeMinor: number; inrCount: number; usdCount: number };

/** Collected per bucket by source, and INR vs USD transaction counts (waivers and zero-amount rows are not transactions). */
export async function loadFinanceTrend(spec: TrendSpec): Promise<TrendRow[]> {
  const db = getDb();
  const csb = schema.collegeSeatBatches;
  const since = spec.since;
  const rows = await timed("finance", "trend", () =>
    db
      .execute(sql`SELECT ${bucketSql(sql`received_at`, spec.bucket)} AS k, source,
          coalesce(sum(inr_minor), 0)::bigint AS inr_minor,
          count(*) FILTER (WHERE currency = 'INR' AND amount_minor > 0)::int AS inr_n, count(*) FILTER (WHERE currency = 'USD' AND amount_minor > 0)::int AS usd_n
        FROM (
          SELECT 'employer' AS source, ${inrMinorSql(revenueAmountSql(EP.amountMinor, EP.raw), EP.currency)} AS inr_minor, upper(${EP.currency}) AS currency, ${EP.amountMinor} AS amount_minor, coalesce(${EP.paidAt}, ${EP.createdAt}) AS received_at
            FROM ${EP} WHERE ${EP.status} IN (${settled}) AND ${realEmployerId(EP.employerId)}
          UNION ALL
          SELECT 'intern', ${inrMinorSql(IP.amountMinor, IP.currency)}, upper(${IP.currency}), ${IP.amountMinor}, coalesce(${IP.paidAt}, ${IP.createdAt})
            FROM ${IP} WHERE ${IP.status} = 'paid' AND ${IP.gateway} <> 'college_drive'
          UNION ALL
          SELECT 'college', ${csb.amountMinor}, 'INR', ${csb.amountMinor}, coalesce(${csb.paidAt}, ${csb.createdAt}) FROM ${csb} WHERE ${csb.status} = 'paid'
        ) r WHERE ${rangeSql(sql`received_at`, since, null)} GROUP BY 1, 2 LIMIT 1000`)
      .then((r) => r.rows as { k: string; source: string; inr_minor: string | number; inr_n: number; usd_n: number }[]),
  );
  const by = new Map<string, TrendRow>();
  for (const r of rows) {
    const t = by.get(r.k) ?? { key: r.k, employerMinor: 0, internMinor: 0, collegeMinor: 0, inrCount: 0, usdCount: 0 };
    if (r.source === "employer") t.employerMinor += n(r.inr_minor);
    else if (r.source === "intern") t.internMinor += n(r.inr_minor);
    else t.collegeMinor += n(r.inr_minor);
    t.inrCount += n(r.inr_n);
    t.usdCount += n(r.usd_n);
    by.set(r.k, t);
  }
  return [...by.values()];
}
