import { sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { SETTLED_STATUSES } from "@/lib/refund-accounting";
import { parseOffer } from "@/lib/offer";
import { revenueAmountSql } from "@/lib/admin/revenue";
import { hiredWhere, inrMinorSql, realEmployers, toInrMinor, wonWhere } from "@/lib/admin/scope";

import { companyProposalBuckets, COMPANY_PAGE_SIZE, lifecycleCounts, type CompanyFilter, type LifecycleCounts, type ProposalBuckets } from "./employers";
import { escapeLike } from "./interns";
import { timed } from "./timing";
import { bucketSql, rangeSql } from "./window-sql";
import { bucketStart, type ReportWindow, type TrendSpec } from "./window";

/**
 * SQL for the Employers tab. Aggregated in Postgres, every query bounded. Test employers (`admin`, the AI
 * interview employer) are excluded everywhere via `realEmployers()` / `realEmployerId()`.
 * Timestamps are UTC clock time without zone; India buckets come from `bucketSql`.
 */

const E = schema.employers;
const P = schema.projects;
const n = (v: unknown) => Number(v ?? 0);
const REAL_PROJECT = sql`${P.employerId} IN (SELECT ${E.id} FROM ${E} WHERE ${realEmployers()})`;
/** A project's status as the lifecycle reads it: blank is legacy active. */
const STATUS = sql`coalesce(nullif(lower(trim(${P.status})), ''), 'active')`;
const LIVE = sql`${STATUS} IN ('published', 'active')`;

export type EmployerCounts = {
  total: number; newWindow: number; newPrev: number | null; today: number; week: number; month: number;
  activeWindow: number; activePrev: number | null; withLive: number;
};

export type ProjectFigures = { lifecycle: LifecycleCounts; takenDown: number; createdWindow: number; createdPrev: number | null; liveNotTakenDown: number };

/** Strip figures: employers (new, active) and the platform-wide proposal buckets for the window. */
export async function loadEmployerSummary(w: ReportWindow, now: Date): Promise<{ counts: EmployerCounts; proposals: ProposalBuckets; projects: ProjectFigures }> {
  const db = getDb();
  const day = bucketStart(now, "day");
  const week = bucketStart(now, "week");
  const month = bucketStart(now, "month");
  const hasPrev = w.prevSince !== null;
  const active = (since: Date | null, until: Date | null) => sql`(
    EXISTS (SELECT 1 FROM ${P} WHERE ${P.employerId} = ${E.id} AND ${rangeSql(P.createdAt, since, until)})
    OR EXISTS (SELECT 1 FROM ${schema.proposals} pp WHERE pp.employer_id = ${E.id} AND lower(pp.status) <> 'draft' AND ${rangeSql(sql`pp.created_at`, since, until)}))`;
  const [counts, proposalRows, projectRows] = await Promise.all([
    timed("employers", "counts", () =>
      db
        .execute(sql`SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ${rangeSql(E.createdAt, w.since, w.until)})::int AS new_window,
            ${hasPrev ? sql`count(*) FILTER (WHERE ${rangeSql(E.createdAt, w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS new_prev,
            count(*) FILTER (WHERE ${rangeSql(E.createdAt, day, null)})::int AS today,
            count(*) FILTER (WHERE ${rangeSql(E.createdAt, week, null)})::int AS week,
            count(*) FILTER (WHERE ${rangeSql(E.createdAt, month, null)})::int AS month,
            count(*) FILTER (WHERE ${active(w.since, w.until)})::int AS active_window,
            ${hasPrev ? sql`count(*) FILTER (WHERE ${active(w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS active_prev,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${P} WHERE ${P.employerId} = ${E.id} AND ${LIVE}))::int AS with_live
          FROM ${E} WHERE ${realEmployers()}`)
        .then((r) => r.rows[0] as Record<string, unknown>),
    ),
    timed("employers", "proposal-status", () =>
      db
        .execute(sql`SELECT lower(status) AS status, count(*)::int AS n FROM ${schema.proposals}
          WHERE employer_id IN (SELECT ${E.id} FROM ${E} WHERE ${realEmployers()}) AND ${rangeSql(sql`created_at`, w.since, w.until)}
          GROUP BY 1 LIMIT 50`)
        .then((r) => r.rows as { status: string; n: number }[]),
    ),
    timed("employers", "project-status", () =>
      db
        .execute(sql`SELECT ${STATUS} AS status, count(*)::int AS n,
            count(*) FILTER (WHERE ${P.takenDownAt} IS NOT NULL)::int AS taken_down,
            count(*) FILTER (WHERE ${LIVE} AND ${P.takenDownAt} IS NULL)::int AS live_ok,
            count(*) FILTER (WHERE ${rangeSql(P.createdAt, w.since, w.until)})::int AS created_window,
            ${hasPrev ? sql`count(*) FILTER (WHERE ${rangeSql(P.createdAt, w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS created_prev
          FROM ${P} WHERE ${REAL_PROJECT} GROUP BY 1 LIMIT 50`)
        .then((r) => r.rows as Record<string, unknown>[]),
    ),
  ]);
  const c = counts ?? {};
  return {
    counts: {
      total: n(c.total), newWindow: n(c.new_window), newPrev: c.new_prev == null ? null : n(c.new_prev), today: n(c.today), week: n(c.week), month: n(c.month),
      activeWindow: n(c.active_window), activePrev: c.active_prev == null ? null : n(c.active_prev), withLive: n(c.with_live),
    },
    proposals: companyProposalBuckets(proposalRows.map((r) => ({ status: r.status, n: n(r.n) }))),
    projects: {
      lifecycle: lifecycleCounts(projectRows.map((r) => ({ status: String(r.status), n: n(r.n) }))),
      takenDown: projectRows.reduce((s, r) => s + n(r.taken_down), 0),
      liveNotTakenDown: projectRows.reduce((s, r) => s + n(r.live_ok), 0),
      createdWindow: projectRows.reduce((s, r) => s + n(r.created_window), 0),
      createdPrev: hasPrev ? projectRows.reduce((s, r) => s + n(r.created_prev), 0) : null,
    },
  };
}

/** New employers and new projects per bucket. */
export async function loadEmployerTrend(spec: TrendSpec): Promise<{ key: string; employers: number; projects: number }[]> {
  const db = getDb();
  const [emps, projs] = await Promise.all([
    timed("employers", "trend-employers", () =>
      db
        .execute(sql`SELECT ${bucketSql(E.createdAt, spec.bucket)} AS k, count(*)::int AS n FROM ${E}
          WHERE ${realEmployers()} AND ${rangeSql(E.createdAt, spec.since, null)} GROUP BY 1 LIMIT 400`)
        .then((r) => r.rows as { k: string; n: number }[]),
    ),
    timed("employers", "trend-projects", () =>
      db
        .execute(sql`SELECT ${bucketSql(P.createdAt, spec.bucket)} AS k, count(*)::int AS n FROM ${P}
          WHERE ${REAL_PROJECT} AND ${rangeSql(P.createdAt, spec.since, null)} GROUP BY 1 LIMIT 400`)
        .then((r) => r.rows as { k: string; n: number }[]),
    ),
  ]);
  const by = new Map<string, { key: string; employers: number; projects: number }>();
  for (const r of emps) by.set(r.k, { key: r.k, employers: n(r.n), projects: 0 });
  for (const r of projs) by.set(r.k, { key: r.k, employers: by.get(r.k)?.employers ?? 0, projects: n(r.n) });
  return [...by.values()];
}

export type CompanyRow = {
  id: string; name: string; email: string; city: string | null; state: string | null; country: string | null; joined: Date | string | null;
  projects: number; live: number; paused: number; closed: number;
  sent: number; accepted: number; rejected: number; pending: number; expired: number; withdrawn: number; interviews: number; hires: number;
  paidMinor: number; mode: string | null;
};

const SORT_SQL: Record<CompanyFilter["sort"], string> = {
  joined: "employers.created_at", name: "lower(employers.company_name)", projects: "projects", sent: "sent", hires: "hires", paid: "paid_minor",
};

/**
 * One page of the per-company table. Projects are today's state (not windowed); proposals, interviews, hires
 * and money follow the window. One grouped query: employers LEFT JOIN four pre-aggregated subqueries, no N+1.
 */
export async function loadCompanies(f: CompanyFilter, w: ReportWindow, opts: { limit?: number; offset?: number; withTotal?: boolean } = {}): Promise<{ rows: CompanyRow[]; total: number }> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? COMPANY_PAGE_SIZE, 5000);
  const offset = opts.offset ?? (f.page - 1) * COMPANY_PAGE_SIZE;
  const win = (col: string) => rangeSql(sql.raw(col), w.since, w.until);
  const parts: SQL[] = [realEmployers()];
  if (f.q) {
    const like = `%${escapeLike(f.q.toLowerCase())}%`;
    parts.push(sql`(lower(employers.company_name) LIKE ${like} OR lower(employers.company_email) LIKE ${like} OR lower(coalesce(employers.city, '')) LIKE ${like} OR lower(coalesce(employers.state, '')) LIKE ${like})`);
  }
  if (f.status === "live") parts.push(sql`coalesce(pr.live, 0) > 0`);
  if (f.status === "paused") parts.push(sql`coalesce(pr.paused, 0) > 0`);
  if (f.status === "none") parts.push(sql`coalesce(pr.total, 0) = 0`);
  if (f.status === "hired") parts.push(sql`coalesce(pp.hires, 0) > 0`);
  const where = sql.join(parts, sql` AND `);
  const from = sql`FROM ${E}
    LEFT JOIN (SELECT employer_id, count(*) AS total,
        count(*) FILTER (WHERE coalesce(nullif(lower(trim(status)), ''), 'active') IN ('published', 'active')) AS live,
        count(*) FILTER (WHERE lower(trim(status)) IN ('paused', 'inactive')) AS paused,
        count(*) FILTER (WHERE lower(trim(status)) IN ('closed', 'archived')) AS closed
      FROM ${P} GROUP BY employer_id) pr ON pr.employer_id = employers.id
    LEFT JOIN (SELECT employer_id,
        count(*) FILTER (WHERE lower(status) <> 'draft' AND ${win("created_at")}) AS sent,
        count(*) FILTER (WHERE ${wonWhere("proposals")} AND ${win("created_at")}) AS accepted,
        count(*) FILTER (WHERE lower(status) = 'rejected' AND ${win("created_at")}) AS rejected,
        count(*) FILTER (WHERE lower(status) IN ('sent', 'interview_scheduled') AND ${win("created_at")}) AS pending,
        count(*) FILTER (WHERE lower(status) = 'expired' AND ${win("created_at")}) AS expired,
        count(*) FILTER (WHERE lower(status) = 'withdrawn' AND ${win("created_at")}) AS withdrawn,
        count(*) FILTER (WHERE ${hiredWhere("proposals")} AND ${win("coalesce(hired_at, updated_at)")}) AS hires
      FROM ${schema.proposals} GROUP BY employer_id) pp ON pp.employer_id = employers.id
    LEFT JOIN (SELECT employer_id, count(*) AS n FROM ${schema.interviews} WHERE ${win("created_at")} GROUP BY employer_id) iv ON iv.employer_id = employers.id
    LEFT JOIN (SELECT employer_id, sum(${inrMinorSql(revenueAmountSql(sql`amount_minor`, sql`raw`), sql`currency`)})::bigint AS paid_minor,
        (array_agg(raw->'notes'->>'paymentMode' ORDER BY coalesce(paid_at, created_at) DESC))[1] AS mode
      FROM ${schema.employerPayments}
      WHERE status IN (${sql.join(SETTLED_STATUSES.map((s) => sql`${s}`), sql`, `)}) AND ${win("coalesce(paid_at, created_at)")}
      GROUP BY employer_id) pay ON pay.employer_id = employers.id`;
  const order = sql.raw(`${SORT_SQL[f.sort]} ${f.dir === "asc" ? "ASC" : "DESC"} NULLS LAST, employers.id`);
  const [rows, total] = await Promise.all([
    timed("employers", "companies-page", () =>
      db
        .execute(sql`SELECT employers.id, employers.company_name, employers.company_email, employers.city, employers.state, employers.country, employers.created_at,
            coalesce(pr.total, 0)::int AS projects, coalesce(pr.live, 0)::int AS live, coalesce(pr.paused, 0)::int AS paused, coalesce(pr.closed, 0)::int AS closed,
            coalesce(pp.sent, 0)::int AS sent, coalesce(pp.accepted, 0)::int AS accepted, coalesce(pp.rejected, 0)::int AS rejected,
            coalesce(pp.pending, 0)::int AS pending, coalesce(pp.expired, 0)::int AS expired, coalesce(pp.withdrawn, 0)::int AS withdrawn,
            coalesce(iv.n, 0)::int AS interviews, coalesce(pp.hires, 0)::int AS hires,
            coalesce(pay.paid_minor, 0)::bigint AS paid_minor, pay.mode
          ${from} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`)
        .then((r) => r.rows as Record<string, unknown>[]),
    ),
    opts.withTotal === false
      ? Promise.resolve(0)
      : timed("employers", "companies-count", () => db.execute(sql`SELECT count(*)::int AS c ${from} WHERE ${where}`).then((r) => n((r.rows[0] as { c: number } | undefined)?.c))),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: String(r.id), name: String(r.company_name ?? ""), email: String(r.company_email ?? ""),
      city: (r.city as string | null) ?? null, state: (r.state as string | null) ?? null, country: (r.country as string | null) ?? null, joined: (r.created_at as Date | string | null) ?? null,
      projects: n(r.projects), live: n(r.live), paused: n(r.paused), closed: n(r.closed),
      sent: n(r.sent), accepted: n(r.accepted), rejected: n(r.rejected), pending: n(r.pending), expired: n(r.expired), withdrawn: n(r.withdrawn),
      interviews: n(r.interviews), hires: n(r.hires), paidMinor: n(r.paid_minor), mode: (r.mode as string | null) ?? null,
    })),
  };
}

const SKILL_KEY = (col: string) => sql.raw(`regexp_replace(lower(${col}), '[^a-z0-9+#]', '', 'g')`);
const explode = (col: string) => sql.raw(`jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END) AS e`);
const SKILL_NAME = sql.raw(`trim(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e->>'name' END)`);

export type SkillDemand = {
  /** Live projects asking, today. */
  live: { key: string; label: string; count: number }[];
  /** Projects created in the window asking. */
  posted: { key: string; label: string; count: number }[];
  /** Interns listing the skill, for the skills in `live`. */
  supply: { key: string; count: number }[];
};

/** Skills employers ask for (top 20 live, top 20 posted in the window) and how many interns have each live one. */
export async function loadSkillDemand(w: ReportWindow): Promise<SkillDemand> {
  const db = getDb();
  const demand = (name: string, extra: SQL) =>
    timed("employers", name, () =>
      db
        .execute(sql`SELECT ${SKILL_KEY("name")} AS k, mode() WITHIN GROUP (ORDER BY trim(name)) AS label, count(DISTINCT id)::int AS c
          FROM (SELECT ${P.id} AS id, ${SKILL_NAME} AS name FROM ${P}, ${explode("skills")} WHERE ${REAL_PROJECT} AND ${extra}) s
          WHERE coalesce(name, '') <> '' AND ${SKILL_KEY("name")} <> '' GROUP BY 1 ORDER BY c DESC, 1 LIMIT 20`)
        .then((r) => (r.rows as { k: string; label: string; c: number }[]).map((x) => ({ key: x.k, label: x.label, count: n(x.c) }))),
    );
  const [live, posted] = await Promise.all([
    demand("demand-live", sql`${LIVE}`),
    demand("demand-posted", rangeSql(P.createdAt, w.since, w.until)),
  ]);
  const keys = live.map((d) => d.key);
  const supply = keys.length
    ? await timed("employers", "supply", () =>
        db
          .execute(sql`SELECT ${SKILL_KEY("name")} AS k, count(DISTINCT user_id)::int AS c
            FROM (SELECT ${schema.internOnboarding.userId} AS user_id, ${SKILL_NAME} AS name FROM ${schema.internOnboarding}
                  JOIN ${schema.users} ON ${schema.users.id} = ${schema.internOnboarding.userId}, ${explode("intern_onboarding.skills")}
                  WHERE ${schema.users.role} = 'intern') s
            WHERE ${SKILL_KEY("name")} IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)}) GROUP BY 1 LIMIT 50`)
          .then((r) => (r.rows as { k: string; c: number }[]).map((x) => ({ key: x.k, count: n(x.c) }))),
      )
    : [];
  return { live, posted, supply };
}

/**
 * Highest-paying skills: average monthly offer (INR) over internship offers made in the window, per skill of the
 * project the offer is for. The offer's money is parsed by the same `parseOffer` as the old analytics (so the
 * figure matches it), which needs the offer JSON in JS: bounded to the 2,000 most recent offers in the window.
 */
export async function loadHighestPaying(w: ReportWindow): Promise<{ rows: { skill: string; avgMonthlyMinor: number; offers: number }[]; sampled: number; capped: boolean }> {
  const db = getDb();
  const LIMIT = 2000;
  const rows = await timed("employers", "paying-skills", () =>
    db
      .execute(sql`SELECT p.offer_details, p.currency, pr.skills FROM ${schema.proposals} p JOIN ${P} pr ON pr.id = p.project_id
        WHERE lower(p.status) <> 'draft' AND p.employer_id IN (SELECT ${E.id} FROM ${E} WHERE ${realEmployers()}) AND ${rangeSql(sql`p.created_at`, w.since, w.until)}
        ORDER BY p.created_at DESC LIMIT ${LIMIT}`)
      .then((r) => r.rows as { offer_details: unknown; currency: string | null; skills: unknown }[]),
  );
  const pay = new Map<string, { label: string; sum: number; n: number }>();
  for (const r of rows) {
    const offer = parseOffer(r.offer_details, r.currency);
    if (offer.fullTime || offer.monthlyMinor == null) continue;
    const monthly = toInrMinor(offer.monthlyMinor, offer.currency);
    const seen = new Set<string>();
    for (const s of Array.isArray(r.skills) ? r.skills : []) {
      const label = String(s ?? "").trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      const cur = pay.get(key) ?? { label, sum: 0, n: 0 };
      pay.set(key, { label: cur.label, sum: cur.sum + monthly, n: cur.n + 1 });
    }
  }
  return {
    rows: [...pay.values()].map((v) => ({ skill: v.label, avgMonthlyMinor: Math.round(v.sum / v.n), offers: v.n })).sort((a, b) => b.avgMonthlyMinor - a.avgMonthlyMinor).slice(0, 10),
    sampled: rows.length,
    capped: rows.length >= LIMIT,
  };
}
