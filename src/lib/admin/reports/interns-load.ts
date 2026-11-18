import { sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { activeAccountSql } from "@/lib/admin/account-views";
import { feePaidSql } from "@/lib/fee-paid-sql";
import { findternScoreSql, meaningfulProfile, realEmployerId } from "@/lib/admin/scope";

import { cityPatterns, mergeCityRows, type MergedCity } from "./city";
import { escapeLike, INTERN_PAGE_SIZE, type InternFilter } from "./interns";
import { timed } from "./timing";
import { bucketSql, rangeSql } from "./window-sql";
import { bucketStart, type BucketUnit, type ReportWindow, type TrendSpec } from "./window";

/**
 * SQL for the Interns tab. Every query aggregates in Postgres and is bounded (GROUP BY ... LIMIT, or
 * LIMIT/OFFSET with a separate count), so no tab ever loads a whole table into JS.
 *
 * Base population: `users.role = 'intern'`. There is no test/seed flag on `users`, so test accounts
 * are not excluded (open item in the report). Banned and hidden interns ARE counted and labelled.
 * Timestamps are UTC clock time without zone; India buckets come from `bucketSql`.
 */

const U = schema.users;
const O = schema.internOnboarding;
const blank = (c: SQL) => sql`coalesce(trim(${c}), '') = ''`;

/**
 * One academics field from `extra_data`, under the key the profile saves it as (lib/onboarding.ts: institution,
 * degree, endYear) with the older / seeded flat keys as fallback (yearOfGraduation, college, graduationYear).
 */
function academic(k: "institution" | "degree" | "year"): SQL {
  const a = sql`${O.extraData}->'academics'`;
  const e = sql`${O.extraData}`;
  if (k === "institution") return sql`nullif(trim(coalesce(${a}->>'institution', ${e}->>'college')), '')`;
  if (k === "degree") return sql`nullif(trim(coalesce(${a}->>'degree', ${e}->>'degree')), '')`;
  return sql`nullif(trim(coalesce(${a}->>'endYear', ${a}->>'yearOfGraduation', ${e}->>'graduationYear')), '')`;
}

/** One row per intern with every flag the tab needs. Reused by the summary, the table and the CSV. */
export function baseCte(): SQL {
  return sql`base AS (
    SELECT ${U.id} AS id, ${U.firstName} AS first_name, ${U.lastName} AS last_name, ${U.email} AS email, ${U.createdAt} AS created_at,
      ${activeAccountSql(U.isActive)} AS is_active, ${U.bannedAt} AS banned_at, ${U.profileVisibility} AS visibility, ${U.emailVerified} AS email_verified,
      nullif(trim(${O.city}), '') AS city, nullif(trim(${O.state}), '') AS state,
      ${academic("institution")} AS college, ${academic("degree")} AS degree, ${academic("year")} AS grad_year,
      coalesce(${O.skills}, '[]'::jsonb) AS skills,
      (${O.id} IS NOT NULL) AS started,
      ${meaningfulProfile()} AS complete,
      ${feePaidSql(sql`${U.id}`, sql`${O.extraData}`)} AS paid,
      ${findternScoreSql()} AS score,
      EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.intern_id = ${U.id} AND lower(p.status) <> 'draft' AND ${realEmployerId(sql`p.employer_id`)}) AS applied,
      EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.intern_id = ${U.id} AND (lower(p.status) = 'hired' OR p.hired_at IS NOT NULL) AND ${realEmployerId(sql`p.employer_id`)}) AS hired,
      (NOT ${blank(sql`${O.aadhaarNumber}`)} AND NOT ${blank(sql`${O.panNumber}`)}) AS kyc,
      (${O.extraData}->>'approvalStatus' = 'Approved') AS approved,
      pr.last_seen_at AS last_seen
    FROM ${U}
    LEFT JOIN ${O} ON ${O.userId} = ${U.id}
    LEFT JOIN ${schema.userPresence} pr ON pr.user_id = ${U.id}
    WHERE ${U.role} = 'intern'
  )`;
}

const n = (v: unknown) => Number(v ?? 0);

export type InternCounts = {
  total: number; newWindow: number; newPrev: number | null; today: number; week: number; month: number;
  hired: number; paid: number; scored: number; kyc: number; approved: number; emailVerified: number;
  banned: number; hidden: number; active: number; inactive: number;
  stages: Record<string, number>;
};

export type AppCounts = { win: number; winInterns: number; prev: number | null; prevInterns: number | null; week: number; weekInterns: number; month: number; monthInterns: number };

/** Counts for the strip, status and stage panels: one aggregate over the base CTE, plus the proposals aggregate. */
export async function loadInternSummary(w: ReportWindow, now: Date): Promise<{ counts: InternCounts; apps: AppCounts }> {
  const db = getDb();
  const day = bucketStart(now, "day");
  const week = bucketStart(now, "week");
  const month = bucketStart(now, "month");
  const hasPrev = w.prevSince !== null;
  const created = sql`created_at`;
  const [counts, apps] = await Promise.all([
    timed("interns", "counts", () =>
      db
        .execute(sql`WITH ${baseCte()}
          SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ${rangeSql(created, w.since, w.until)})::int AS new_window,
            ${hasPrev ? sql`count(*) FILTER (WHERE ${rangeSql(created, w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS new_prev,
            count(*) FILTER (WHERE ${rangeSql(created, day, null)})::int AS today,
            count(*) FILTER (WHERE ${rangeSql(created, week, null)})::int AS week,
            count(*) FILTER (WHERE ${rangeSql(created, month, null)})::int AS month,
            count(*) FILTER (WHERE hired)::int AS hired,
            count(*) FILTER (WHERE paid)::int AS paid,
            count(*) FILTER (WHERE score IS NOT NULL)::int AS scored,
            count(*) FILTER (WHERE kyc)::int AS kyc,
            count(*) FILTER (WHERE approved)::int AS approved,
            count(*) FILTER (WHERE email_verified)::int AS email_verified,
            count(*) FILTER (WHERE banned_at IS NOT NULL)::int AS banned,
            count(*) FILTER (WHERE banned_at IS NULL AND visibility = 'hidden')::int AS hidden,
            count(*) FILTER (WHERE banned_at IS NULL AND visibility <> 'hidden' AND is_active)::int AS active,
            count(*) FILTER (WHERE banned_at IS NULL AND visibility <> 'hidden' AND NOT is_active)::int AS inactive,
            count(*) FILTER (WHERE hired)::int AS s_hired,
            count(*) FILTER (WHERE NOT hired AND applied)::int AS s_in_pipeline,
            count(*) FILTER (WHERE NOT hired AND NOT applied AND score IS NOT NULL)::int AS s_interviewed,
            count(*) FILTER (WHERE NOT hired AND NOT applied AND score IS NULL AND paid)::int AS s_activated,
            count(*) FILTER (WHERE NOT hired AND NOT applied AND score IS NULL AND NOT paid AND complete)::int AS s_profile_complete,
            count(*) FILTER (WHERE NOT hired AND NOT applied AND score IS NULL AND NOT paid AND NOT complete AND started)::int AS s_profile_started,
            count(*) FILTER (WHERE NOT hired AND NOT applied AND score IS NULL AND NOT paid AND NOT complete AND NOT started)::int AS s_signed_up
          FROM base`)
        .then((r) => r.rows[0] as Record<string, unknown>),
    ),
    timed("interns", "applications", () => {
      const f = (since: Date | null, until: Date | null) => rangeSql(sql`created_at`, since, until);
      return db
        .execute(sql`SELECT
            count(*) FILTER (WHERE ${f(w.since, w.until)})::int AS win,
            count(DISTINCT intern_id) FILTER (WHERE ${f(w.since, w.until)})::int AS win_i,
            ${hasPrev ? sql`count(*) FILTER (WHERE ${f(w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS prev,
            ${hasPrev ? sql`count(DISTINCT intern_id) FILTER (WHERE ${f(w.prevSince, w.prevUntil)})::int` : sql`NULL::int`} AS prev_i,
            count(*) FILTER (WHERE ${f(week, null)})::int AS week,
            count(DISTINCT intern_id) FILTER (WHERE ${f(week, null)})::int AS week_i,
            count(*) FILTER (WHERE ${f(month, null)})::int AS month,
            count(DISTINCT intern_id) FILTER (WHERE ${f(month, null)})::int AS month_i
          FROM ${schema.proposals} WHERE lower(status) <> 'draft' AND ${realEmployerId(sql`employer_id`)}`)
        .then((r) => r.rows[0] as Record<string, unknown>);
    }),
  ]);
  const c = counts ?? {};
  const a = apps ?? {};
  return {
    counts: {
      total: n(c.total), newWindow: n(c.new_window), newPrev: c.new_prev == null ? null : n(c.new_prev), today: n(c.today), week: n(c.week), month: n(c.month),
      hired: n(c.hired), paid: n(c.paid), scored: n(c.scored), kyc: n(c.kyc), approved: n(c.approved), emailVerified: n(c.email_verified),
      banned: n(c.banned), hidden: n(c.hidden), active: n(c.active), inactive: n(c.inactive),
      stages: {
        signed_up: n(c.s_signed_up), profile_started: n(c.s_profile_started), profile_complete: n(c.s_profile_complete), activated: n(c.s_activated),
        interviewed: n(c.s_interviewed), in_pipeline: n(c.s_in_pipeline), hired: n(c.s_hired),
      },
    },
    apps: {
      win: n(a.win), winInterns: n(a.win_i), prev: a.prev == null ? null : n(a.prev), prevInterns: a.prev_i == null ? null : n(a.prev_i),
      week: n(a.week), weekInterns: n(a.week_i), month: n(a.month), monthInterns: n(a.month_i),
    },
  };
}

/** New interns per bucket (India day / week / month), for the trend chart. */
export async function loadInternTrend(spec: TrendSpec): Promise<{ key: string; n: number }[]> {
  const db = getDb();
  const rows = await timed("interns", "trend", () =>
    db
      .execute(sql`SELECT ${bucketSql(U.createdAt, spec.bucket)} AS k, count(*)::int AS n FROM ${U}
        WHERE ${U.role} = 'intern' AND ${rangeSql(U.createdAt, spec.since, null)} GROUP BY 1 ORDER BY 1 LIMIT 400`)
      .then((r) => r.rows as { k: string; n: number }[]),
  );
  return rows.map((r) => ({ key: r.k, n: n(r.n) }));
}

const CITY_KEY = sql`lower(regexp_replace(trim(${O.city}), '\\s+', ' ', 'g'))`;

export type Geography = { cities: MergedCity[]; withCity: number; totalInterns: number; distinctCities: number; states: { state: string; count: number }[] };

/** Interns by city: grouped in SQL on the cleaned text (at most 300 groups), merged by the normaliser (Jaipur/jaypur/Jaipur, Rajasthan). */
export async function loadGeography(): Promise<Geography> {
  const db = getDb();
  const [rows, tot, states] = await Promise.all([
    timed("interns", "cities", () =>
      db
        .execute(sql`SELECT ${CITY_KEY} AS city, count(*)::int AS c, mode() WITHIN GROUP (ORDER BY nullif(trim(${O.state}), '')) AS state
          FROM ${O} JOIN ${U} ON ${U.id} = ${O.userId}
          WHERE ${U.role} = 'intern' AND NOT ${blank(sql`${O.city}`)} GROUP BY 1 ORDER BY c DESC, 1 LIMIT 300`)
        .then((r) => r.rows as { city: string; c: number; state: string | null }[]),
    ),
    timed("interns", "city-totals", () =>
      db
        .execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT ${blank(sql`${O.city}`)})::int AS with_city
          FROM ${U} LEFT JOIN ${O} ON ${O.userId} = ${U.id} WHERE ${U.role} = 'intern'`)
        .then((r) => r.rows[0] as { total: number; with_city: number }),
    ),
    timed("interns", "states", () =>
      db
        .execute(sql`SELECT initcap(lower(trim(${O.state}))) AS state, count(*)::int AS c
          FROM ${O} JOIN ${U} ON ${U.id} = ${O.userId}
          WHERE ${U.role} = 'intern' AND NOT ${blank(sql`${O.state}`)} GROUP BY 1 ORDER BY c DESC, 1 LIMIT 12`)
        .then((r) => r.rows as { state: string; c: number }[]),
    ),
  ]);
  const cities = mergeCityRows(rows.map((r) => ({ city: r.city, count: n(r.c), state: r.state })));
  return {
    cities,
    withCity: n(tot?.with_city),
    totalInterns: n(tot?.total),
    distinctCities: cities.length,
    states: states.map((s) => ({ state: s.state, count: n(s.c) })),
  };
}

export type Dim = { label: string; count: number };
export type Education = { colleges: Dim[]; degrees: Dim[]; years: Dim[]; total: number; missing: { college: number; degree: number; year: number } };

/** Interns by college, degree and graduation year (intern_onboarding.extra_data.academics): top 10 each, blank counted apart. */
export async function loadEducation(): Promise<Education> {
  const db = getDb();
  const field = (k: "institution" | "degree" | "year") => academic(k);
  const top = (name: string, k: "institution" | "degree" | "year", label: SQL) =>
    timed("interns", name, () =>
      db
        .execute(sql`SELECT ${label} AS label, count(*)::int AS c FROM ${O} JOIN ${U} ON ${U.id} = ${O.userId}
          WHERE ${U.role} = 'intern' AND ${field(k)} IS NOT NULL
          GROUP BY lower(regexp_replace(${field(k)}, '\\s+', ' ', 'g')) ORDER BY c DESC, 1 LIMIT 10`)
        .then((r) => (r.rows as { label: string; c: number }[]).map((x) => ({ label: x.label, count: n(x.c) }))),
    );
  const [colleges, degrees, years, totals] = await Promise.all([
    top("colleges", "institution", sql`min(${field("institution")})`),
    top("degrees", "degree", sql`min(${field("degree")})`),
    top("grad-years", "year", sql`min(${field("year")})`),
    timed("interns", "academics-missing", () =>
      db
        .execute(sql`SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ${field("institution")} IS NULL)::int AS no_college,
            count(*) FILTER (WHERE ${field("degree")} IS NULL)::int AS no_degree,
            count(*) FILTER (WHERE ${field("year")} IS NULL)::int AS no_year
          FROM ${U} LEFT JOIN ${O} ON ${O.userId} = ${U.id} WHERE ${U.role} = 'intern'`)
        .then((r) => r.rows[0] as Record<string, unknown>),
    ),
  ]);
  return {
    colleges, degrees, years: years.sort((a, b) => b.label.localeCompare(a.label)),
    total: n(totals?.total),
    missing: { college: n(totals?.no_college), degree: n(totals?.no_degree), year: n(totals?.no_year) },
  };
}

export type SkillRow = { skill: string; total: number; espresso: number; cappuccino: number; latte: number; unscored: number };
export type SkillSupply = { skills: SkillRow[]; bands: Record<"espresso" | "cappuccino" | "latte" | "unscored", number> };

/** `jsonb_array_elements(<col> as an array)` as a FROM item; its one column is `e`. A non-array value explodes to nothing. */
const explode = (col: string) => sql.raw(`jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END) AS e`);

/** Top 15 skills by interns, each split into the three score bands; plus the overall band split. One CTE, bounded to 15 skills x 4 bands. */
export async function loadSkillSupply(): Promise<SkillSupply> {
  const db = getDb();
  const band = sql`CASE WHEN score IS NULL THEN 'unscored' WHEN score >= 8 THEN 'latte' WHEN score >= 6 THEN 'cappuccino' ELSE 'espresso' END`;
  const [rows, overall] = await Promise.all([
    timed("interns", "skills-by-band", () =>
      db
        .execute(sql`WITH ${baseCte()},
          ex AS (
            SELECT DISTINCT b.id, lower(trim(s.name)) AS k, trim(s.name) AS label, ${band} AS band
            FROM base b
            CROSS JOIN LATERAL (SELECT CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e->>'name' END AS name FROM ${explode("b.skills")}) s
            WHERE coalesce(trim(s.name), '') <> ''
          ),
          topk AS (SELECT k FROM ex GROUP BY k ORDER BY count(*) DESC, k LIMIT 15)
          SELECT ex.k, min(ex.label) AS label, ex.band, count(*)::int AS c FROM ex JOIN topk USING (k) GROUP BY ex.k, ex.band LIMIT 100`)
        .then((r) => r.rows as { k: string; label: string; band: string; c: number }[]),
    ),
    timed("interns", "bands", () =>
      db
        .execute(sql`WITH ${baseCte()} SELECT ${band} AS band, count(*)::int AS c FROM base GROUP BY 1`)
        .then((r) => r.rows as { band: string; c: number }[]),
    ),
  ]);
  const by = new Map<string, SkillRow>();
  for (const r of rows) {
    const row = by.get(r.k) ?? { skill: r.label, total: 0, espresso: 0, cappuccino: 0, latte: 0, unscored: 0 };
    const c = n(r.c);
    row.total += c;
    if (r.band === "espresso" || r.band === "cappuccino" || r.band === "latte" || r.band === "unscored") row[r.band] += c;
    by.set(r.k, row);
  }
  const bands = { espresso: 0, cappuccino: 0, latte: 0, unscored: 0 };
  for (const r of overall) if (r.band in bands) bands[r.band as keyof typeof bands] = n(r.c);
  return { skills: [...by.values()].sort((a, b) => b.total - a.total || a.skill.localeCompare(b.skill)), bands };
}

export type InternRow = {
  id: string; name: string; email: string; city: string | null; state: string | null; college: string | null; degree: string | null;
  skills: unknown; score: number | null; status: string; hired: boolean; applied: boolean; paid: boolean; started: boolean; complete: boolean;
  createdAt: Date | string | null; lastSeen: Date | string | null;
};

function tableWhere(f: InternFilter): SQL {
  const parts: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q.toLowerCase())}%`;
    parts.push(sql`(lower(first_name || ' ' || last_name) LIKE ${like} OR lower(email) LIKE ${like} OR lower(coalesce(city, '')) LIKE ${like} OR lower(coalesce(college, '')) LIKE ${like} OR lower(skills::text) LIKE ${like})`);
  }
  if (f.city) {
    const pats = cityPatterns(f.city.toLowerCase());
    parts.push(sql`lower(regexp_replace(coalesce(city, ''), '\\s+', ' ', 'g')) LIKE ANY (ARRAY[${sql.join(pats.map((p) => sql`${p}`), sql`, `)}])`);
  }
  if (f.skill) {
    // Exact skill (case-insensitive) among the intern's skills, strings or {name} objects.
    parts.push(sql`EXISTS (SELECT 1 FROM ${explode("skills")} WHERE lower(trim(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e->>'name' END)) = ${f.skill.toLowerCase()})`);
  }
  const status: Record<string, SQL> = {
    active: sql`banned_at IS NULL AND visibility <> 'hidden' AND is_active`,
    hidden: sql`banned_at IS NULL AND visibility = 'hidden'`,
    banned: sql`banned_at IS NOT NULL`,
    hired: sql`hired`, unhired: sql`NOT hired`, paid: sql`paid`, unpaid: sql`NOT paid`, scored: sql`score IS NOT NULL`, unscored: sql`score IS NULL`,
  };
  if (f.status && status[f.status]) parts.push(status[f.status]);
  if (f.band === "unscored") parts.push(sql`score IS NULL`);
  else if (f.band === "latte") parts.push(sql`score >= 8`);
  else if (f.band === "cappuccino") parts.push(sql`score >= 6 AND score < 8`);
  else if (f.band === "espresso") parts.push(sql`score < 6`);
  return parts.length ? sql.join([sql`WHERE`, sql.join(parts, sql` AND `)], sql` `) : sql``;
}

const SORT_SQL: Record<InternFilter["sort"], string> = {
  joined: "created_at", name: "lower(first_name || ' ' || last_name)", city: "lower(city)", score: "score", active: "last_seen",
};

/** One page (or up to `limit` rows for the CSV) of the filtered intern table, plus the filtered total. */
export async function loadInternTable(f: InternFilter, opts: { limit?: number; offset?: number; withTotal?: boolean } = {}): Promise<{ rows: InternRow[]; total: number }> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? INTERN_PAGE_SIZE, 5000);
  const offset = opts.offset ?? (f.page - 1) * INTERN_PAGE_SIZE;
  const where = tableWhere(f);
  const order = sql.raw(`${SORT_SQL[f.sort]} ${f.dir === "asc" ? "ASC" : "DESC"} NULLS LAST, id`);
  const [rows, total] = await Promise.all([
    timed("interns", "table-page", () =>
      db
        .execute(sql`WITH ${baseCte()}
          SELECT id, first_name, last_name, email, city, state, college, degree, skills, score, hired, applied, paid, started, complete, created_at, last_seen,
            CASE WHEN banned_at IS NOT NULL THEN 'banned' WHEN visibility = 'hidden' THEN 'hidden' WHEN NOT is_active THEN 'inactive' ELSE 'active' END AS status
          FROM base ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`)
        .then((r) => r.rows as Record<string, unknown>[]),
    ),
    opts.withTotal === false
      ? Promise.resolve(0)
      : timed("interns", "table-count", () =>
          db.execute(sql`WITH ${baseCte()} SELECT count(*)::int AS c FROM base ${where}`).then((r) => n((r.rows[0] as { c: number } | undefined)?.c)),
        ),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: String(r.id), name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), email: String(r.email ?? ""),
      city: (r.city as string | null) ?? null, state: (r.state as string | null) ?? null, college: (r.college as string | null) ?? null, degree: (r.degree as string | null) ?? null,
      skills: r.skills, score: r.score == null ? null : Number(r.score), status: String(r.status),
      hired: Boolean(r.hired), applied: Boolean(r.applied), paid: Boolean(r.paid), started: Boolean(r.started), complete: Boolean(r.complete),
      createdAt: (r.created_at as Date | string | null) ?? null, lastSeen: (r.last_seen as Date | string | null) ?? null,
    })),
  };
}

export type { BucketUnit };
