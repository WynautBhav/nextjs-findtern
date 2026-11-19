import { sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { SETTLED_STATUSES } from "@/lib/refund-accounting";
import { realEmployerId, realEmployers } from "@/lib/admin/scope";

import { expiredAiRows } from "@/lib/admin/ai-interview-expiry";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import { loadExpiredProposals } from "@/lib/admin/expired-load";
import { getAiLinkExpiryDays } from "@/lib/platform-settings";

import { expiriesInWindow, type Expiries } from "./expiries";
import { baseCte } from "./interns-load";
import type { Share } from "./overview";
import { timed } from "./timing";
import { bucketSql, rangeSql } from "./window-sql";
import { bucketStart, type ReportWindow, type TrendSpec } from "./window";

/**
 * SQL for the Overview tab's growth section. Interns are `users.role = 'intern'`; employers are real ones
 * (test employers excluded). A payer is an intern with a paid activation fee of more than 0 that is not a
 * college-drive waiver, or an employer with a settled order of more than 0, at `coalesce(paid_at, created_at)`.
 */

const U = schema.users;
const E = schema.employers;
const IP = schema.internPayments;
const EP = schema.employerPayments;
const n = (v: unknown) => Number(v ?? 0);
const settled = sql.join(SETTLED_STATUSES.map((s) => sql`${s}`), sql`, `);

export type Periods = { window: number; prev: number | null; today: number; week: number; month: number };

type Cut = { since: Date | null; until: Date | null };

function periodCols(col: SQL, w: ReportWindow, now: Date, distinct?: SQL): SQL {
  const cnt = (c: Cut) => (distinct ? sql`count(DISTINCT ${distinct}) FILTER (WHERE ${rangeSql(col, c.since, c.until)})::int` : sql`count(*) FILTER (WHERE ${rangeSql(col, c.since, c.until)})::int`);
  return sql`${cnt({ since: w.since, until: w.until })} AS win,
    ${w.prevSince ? cnt({ since: w.prevSince, until: w.prevUntil }) : sql`NULL::int`} AS prev,
    ${cnt({ since: bucketStart(now, "day"), until: null })} AS today,
    ${cnt({ since: bucketStart(now, "week"), until: null })} AS week,
    ${cnt({ since: bucketStart(now, "month"), until: null })} AS month`;
}
const toPeriods = (r: Record<string, unknown> | undefined): Periods => ({ window: n(r?.win), prev: r?.prev == null ? null : n(r.prev), today: n(r?.today), week: n(r?.week), month: n(r?.month) });

export type OverviewCounts = { internSignups: Periods; employerSignups: Periods; internPayers: Periods; employerPayers: Periods; totalInterns: number; totalEmployers: number };

/** New interns, new employers, paying interns, paying employers: window, previous window, today, week, month. Four small aggregates in parallel. */
export async function loadOverviewCounts(w: ReportWindow, now: Date): Promise<OverviewCounts> {
  const db = getDb();
  const run = (name: string, q: SQL) => timed("overview", name, () => db.execute(q).then((r) => r.rows[0] as Record<string, unknown>));
  const [i, e, ip, ep] = await Promise.all([
    run("interns", sql`SELECT ${periodCols(sql`${U.createdAt}`, w, now)}, count(*)::int AS total FROM ${U} WHERE ${U.role} = 'intern'`),
    run("employers", sql`SELECT ${periodCols(sql`${E.createdAt}`, w, now)}, count(*)::int AS total FROM ${E} WHERE ${realEmployers()}`),
    run("paying-interns", sql`SELECT ${periodCols(sql`coalesce(${IP.paidAt}, ${IP.createdAt})`, w, now, sql`${IP.internId}`)} FROM ${IP}
      WHERE ${IP.status} = 'paid' AND ${IP.amountMinor} > 0 AND ${IP.gateway} <> 'college_drive'`),
    run("paying-employers", sql`SELECT ${periodCols(sql`coalesce(${EP.paidAt}, ${EP.createdAt})`, w, now, sql`${EP.employerId}`)} FROM ${EP}
      WHERE ${EP.status} IN (${settled}) AND ${EP.amountMinor} > 0 AND ${realEmployerId(EP.employerId)}`),
  ]);
  return { internSignups: toPeriods(i), employerSignups: toPeriods(e), internPayers: toPeriods(ip), employerPayers: toPeriods(ep), totalInterns: n(i?.total), totalEmployers: n(e?.total) };
}

/**
 * "Paid" for an intern means fee received: a settled activation row of more than 0 that is not a college-drive waiver. It is the
 * same test as the growth counters above (B-13), so Overview and the funnel cannot disagree. Activated without paying is its own figure.
 */
const paidFeeSql = (userId: SQL) =>
  sql`EXISTS (SELECT 1 FROM ${IP} ip WHERE ip.intern_id = ${userId} AND ip.status = 'paid' AND ip.amount_minor > 0 AND ip.gateway <> 'college_drive')`;

export type Cohorts = {
  interns: { signups: number; profileComplete: number; applied: number; hired: number; paid: number; activatedFree: number };
  employers: { signups: number; setupDone: number; posted: number; proposed: number; paid: number };
};

/** People who signed up in the window and what they have done since (each counted on its own). */
export async function loadCohorts(w: ReportWindow): Promise<Cohorts> {
  const db = getDb();
  const emp = sql`${realEmployers()} AND ${rangeSql(sql`${E.createdAt}`, w.since, w.until)}`;
  const [i, e] = await Promise.all([
    timed("overview", "intern-cohort", () =>
      db
        .execute(sql`WITH ${baseCte()} SELECT count(*)::int AS signups, count(*) FILTER (WHERE complete)::int AS complete, count(*) FILTER (WHERE applied)::int AS applied,
            count(*) FILTER (WHERE hired)::int AS hired, count(*) FILTER (WHERE ${paidFeeSql(sql`id`)})::int AS paid,
            count(*) FILTER (WHERE paid AND NOT ${paidFeeSql(sql`id`)})::int AS free
          FROM base WHERE ${rangeSql(sql`created_at`, w.since, w.until)}`)
        .then((r) => r.rows[0] as Record<string, unknown>),
    ),
    timed("overview", "employer-cohort", () =>
      db
        .execute(sql`SELECT count(*)::int AS signups,
            count(*) FILTER (WHERE ${E.setupCompleted})::int AS setup,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${schema.projects} pr WHERE pr.employer_id = ${E.id}))::int AS posted,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${schema.proposals} pp WHERE pp.employer_id = ${E.id} AND lower(pp.status) <> 'draft'))::int AS proposed,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${EP} ep WHERE ep.employer_id = ${E.id} AND ep.status IN (${settled}) AND ep.amount_minor > 0))::int AS paid
          FROM ${E} WHERE ${emp}`)
        .then((r) => r.rows[0] as Record<string, unknown>),
    ),
  ]);
  return {
    interns: { signups: n(i?.signups), profileComplete: n(i?.complete), applied: n(i?.applied), hired: n(i?.hired), paid: n(i?.paid), activatedFree: n(i?.free) },
    employers: { signups: n(e?.signups), setupDone: n(e?.setup), posted: n(e?.posted), proposed: n(e?.proposed), paid: n(e?.paid) },
  };
}

export type OverviewTrendRow = { key: string; interns: number; employers: number; internPayers: number; employerPayers: number };

/** Per bucket: new interns, new employers, interns who paid, employers who paid. */
export async function loadOverviewTrend(spec: TrendSpec): Promise<OverviewTrendRow[]> {
  const db = getDb();
  const since = spec.since;
  const grouped = (name: string, col: SQL, from: SQL, where: SQL, count: SQL) =>
    timed("overview", name, () =>
      db.execute(sql`SELECT ${bucketSql(col, spec.bucket)} AS k, ${count} AS c FROM ${from} WHERE ${where} AND ${rangeSql(col, since, null)} GROUP BY 1 LIMIT 400`).then((r) => r.rows as { k: string; c: number }[]),
    );
  const [i, e, ip, ep] = await Promise.all([
    grouped("trend-interns", sql`${U.createdAt}`, sql`${U}`, sql`${U.role} = 'intern'`, sql`count(*)::int`),
    grouped("trend-employers", sql`${E.createdAt}`, sql`${E}`, realEmployers(), sql`count(*)::int`),
    grouped("trend-paying-interns", sql`coalesce(${IP.paidAt}, ${IP.createdAt})`, sql`${IP}`, sql`${IP.status} = 'paid' AND ${IP.amountMinor} > 0 AND ${IP.gateway} <> 'college_drive'`, sql`count(DISTINCT ${IP.internId})::int`),
    grouped("trend-paying-employers", sql`coalesce(${EP.paidAt}, ${EP.createdAt})`, sql`${EP}`, sql`${EP.status} IN (${settled}) AND ${EP.amountMinor} > 0 AND ${realEmployerId(EP.employerId)}`, sql`count(DISTINCT ${EP.employerId})::int`),
  ]);
  const by = new Map<string, OverviewTrendRow>();
  const row = (k: string) => by.get(k) ?? by.set(k, { key: k, interns: 0, employers: 0, internPayers: 0, employerPayers: 0 }).get(k)!;
  for (const r of i) row(r.k).interns = n(r.c);
  for (const r of e) row(r.k).employers = n(r.c);
  for (const r of ip) row(r.k).internPayers = n(r.c);
  for (const r of ep) row(r.k).employerPayers = n(r.c);
  return [...by.values()];
}

export type Acquisition = { signups: number; signedUpAndPaid: number; college: Share[]; promo: Share[]; accountType: Share[] };

/**
 * Where the window's new interns came from, from existing columns only: a college membership (which college),
 * a promo code used (which code), and the account type on the profile. No UTM, referrer or "how did you hear" column exists.
 */
export async function loadAcquisition(w: ReportWindow): Promise<Acquisition> {
  const db = getDb();
  const cohort = sql`${U.role} = 'intern' AND ${rangeSql(sql`${U.createdAt}`, w.since, w.until)}`;
  const [college, promo, type, paid] = await Promise.all([
    timed("overview", "acq-college", () =>
      db
        .execute(sql`SELECT c.name AS label, count(*)::int AS c FROM ${schema.collegeMemberships} m JOIN ${U} ON ${U.id} = m.user_id JOIN ${schema.colleges} c ON c.id = m.college_id
          WHERE ${cohort} AND m.left_at IS NULL GROUP BY c.id, c.name ORDER BY c DESC, 1 LIMIT 6`)
        .then((r) => (r.rows as { label: string; c: number }[]).map((x) => ({ label: x.label, count: n(x.c) }))),
    ),
    timed("overview", "acq-promo", () =>
      db
        .execute(sql`SELECT pc.code AS label, count(DISTINCT u2.user_id)::int AS c FROM ${schema.promoCodeUsages} u2 JOIN ${schema.promoCodes} pc ON pc.id = u2.promo_code_id JOIN ${U} ON ${U.id} = u2.user_id
          WHERE ${cohort} GROUP BY pc.id, pc.code ORDER BY c DESC, 1 LIMIT 6`)
        .then((r) => (r.rows as { label: string; c: number }[]).map((x) => ({ label: x.label, count: n(x.c) }))),
    ),
    timed("overview", "acq-type", () =>
      db
        .execute(sql`SELECT coalesce(nullif(${schema.internOnboarding.extraData}->>'accountType', ''), 'not chosen') AS label, count(*)::int AS c
          FROM ${U} LEFT JOIN ${schema.internOnboarding} ON ${schema.internOnboarding.userId} = ${U.id} WHERE ${cohort} GROUP BY 1 ORDER BY c DESC LIMIT 5`)
        .then((r) => (r.rows as { label: string; c: number }[]).map((x) => ({ label: x.label, count: n(x.c) }))),
    ),
    timed("overview", "acq-total", () =>
      db
        .execute(sql`SELECT count(*)::int AS signups, count(*) FILTER (WHERE ${paidFeeSql(sql`${U.id}`)})::int AS paid
          FROM ${U} LEFT JOIN ${schema.internOnboarding} ON ${schema.internOnboarding.userId} = ${U.id} WHERE ${cohort}`)
        .then((r) => r.rows[0] as { signups: number; paid: number }),
    ),
  ]);
  return { signups: n(paid?.signups), signedUpAndPaid: n(paid?.paid), college, promo, accountType: type };
}

/**
 * Offers and AI interviews that expired in the window, by reason. The same loaders and pure rules as the tracker's and the AI
 * page's Expired tabs (so a count equals its list), cut to the window on the expiry time. Throws on a database error: the
 * section shows an inline error, never a false 0.
 */
export async function loadExpiries(w: ReportWindow, now: Date): Promise<Expiries> {
  const [proposals, ai, days] = await Promise.all([
    timed("overview", "expired-offers", () => loadExpiredProposals(now)),
    timed("overview", "expired-ai", () => loadAiLinkRows()),
    getAiLinkExpiryDays(),
  ]);
  return expiriesInWindow({ proposals, ai: expiredAiRows(ai, now, days) }, { since: w.since, until: w.until });
}
