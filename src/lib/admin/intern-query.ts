import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { feePaidSql } from "@/lib/fee-paid-sql";
import { searchAny } from "@/lib/admin/params";
import { aiInterviewAt, aiInterviewStatus, findternScoreSql, meaningfulProfile } from "@/lib/admin/scope";
import { loadLedgerByIntern, loadPlacementDues, type PlacementDueRow } from "@/lib/admin/payout-list";
import { maskTail } from "@/lib/admin/identity-mask";
import { internMoney, matchesDue, todayIstIso, type DueFilter, type InternMoney } from "@/lib/admin/intern-list";

/**
 * The candidate directory query, shared by `/admin/interns` and its CSV
 * export so the file always holds exactly the rows the screen shows
 * (same filters, same sort), only without the page limit.
 */

export const INTERN_SORTS = ["created", "name", "email", "score", "owed", "next"] as const;
export type InternSortKey = (typeof INTERN_SORTS)[number];

export type InternRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isActive: boolean;
  visibility: string;
  createdAt: Date | null;
  hasOnboarding: boolean;
  hasProfile: boolean;
  openToWork: boolean;
  aiStatus: string;
  interviewAt: Date | null;
  score: number | null;
  ratings: Record<string, number> | null;
  approval: string | null;
  offerStatus: string | null;
  hired: boolean;
  fullTime: boolean;
  projectStatus: string | null;
  feePaid: boolean;
  money: InternMoney | null;
  /** Only loaded when a bank column is visible; the account number is masked unless `fullAccount`. */
  bank?: { holder: string; account: string; ifsc: string; name: string; upi: string };
};

/** Hired = status "hired" or a hire timestamp (legacy rule, lib/hire-status). */
const HIRED = sql`(lower(p.status) = 'hired' OR p.hired_at IS NOT NULL)`;

export async function loadInterns(
  params: Record<string, string>,
  req: { search: string; limit: number; offset: number },
  sortKey: InternSortKey,
  dir: "asc" | "desc",
  /** `maxRows`: count first and return no rows when more match (the export's cap; refusing is cheap, loading is not). */
  opts: { bank?: boolean; fullAccount?: boolean; maxRows?: number } = {},
) {
  const db = getDb();
  const o = schema.internOnboarding;
  const u = schema.users;

  // Same sources as the Payouts page: placement dues plus the payouts ledger.
  // The set is small (hires), and loading it whole is what lets the payout-date
  // filters and the money sorts run across all pages, not just this one.
  const [dues, ledger] = await Promise.all([loadPlacementDues(), loadLedgerByIntern()]);
  const duesByIntern = new Map<string, PlacementDueRow[]>();
  for (const d of dues) duesByIntern.set(d.internId, [...(duesByIntern.get(d.internId) ?? []), d]);
  const money = new Map<string, InternMoney>();
  for (const id of new Set([...duesByIntern.keys(), ...ledger.keys()])) money.set(id, internMoney(duesByIntern.get(id) ?? [], ledger.get(id)));

  const today = todayIstIso();
  const due = ["overdue", "week", "month", "has", "none"].includes(params.due ?? "") ? (params.due as DueFilter) : null;
  let dueCondition: SQL | undefined;
  if (due) {
    const withDate = [...money.entries()].filter(([, m]) => m.nextDate).map(([id]) => id);
    if (due === "none") {
      dueCondition = withDate.length ? sql`${u.id} NOT IN (${sql.join(withDate.map((id) => sql`${id}`), sql`, `)})` : undefined;
    } else {
      const ids = [...money.entries()].filter(([, m]) => matchesDue(m.nextDate, due, today)).map(([id]) => id);
      dueCondition = ids.length ? inArray(u.id, ids) : sql`false`;
    }
  }

  const profileFilled = meaningfulProfile();
  const aiStatus = aiInterviewStatus();
  const scoreSql = findternScoreSql();
  const openToWork = sql<boolean>`coalesce(${o.extraData}->>'openToWork', 'true') <> 'false'`;
  const approval = sql<string | null>`${o.extraData}->>'approvalStatus'`;
  const hiredExists = sql<boolean>`EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.intern_id = ${u.id} AND ${HIRED})`;
  const fullTime = sql<boolean>`EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.intern_id = ${u.id}
    AND (${HIRED} OR lower(p.status) = 'accepted') AND jsonb_typeof(p.offer_details->'fullTimeOffer') = 'object')`;
  const feePaid = feePaidSql(u.id, o.extraData);
  // Hired wins; otherwise the latest proposal (legacy offerStatus).
  const offerStatus = sql<string | null>`(SELECT lower(p.status) FROM ${schema.proposals} p WHERE p.intern_id = ${u.id}
    ORDER BY ${HIRED} DESC, p.created_at DESC NULLS LAST LIMIT 1)`;
  const projectStatus = sql<string | null>`(SELECT lower(pr.status) FROM ${schema.proposals} p JOIN ${schema.projects} pr ON pr.id = p.project_id
    WHERE p.intern_id = ${u.id} AND ${HIRED} ORDER BY p.hired_at DESC NULLS LAST, p.updated_at DESC NULLS LAST LIMIT 1)`;

  // Same fallback as identity-mask: current `bankDetails`, else legacy `bank`.
  const bankField = (key: string) =>
    sql<string>`coalesce(coalesce(${o.extraData}->'bankDetails', ${o.extraData}->'bank')->>${key}, '')`;

  const conditions = [
    eq(u.role, "intern"),
    searchAny([sql`${u.firstName}`, sql`${u.lastName}`, sql`${u.email}`, sql`${u.phoneNumber}`], req.search),
    params.status ? eq(u.isActive, params.status === "active") : undefined,
    params.visibility === "intern_hidden"
      ? sql`not ${openToWork}`
      : params.visibility
        ? eq(u.profileVisibility, params.visibility)
        : undefined,
    params.profile === "complete" ? profileFilled : undefined,
    params.profile === "incomplete" ? sql`not ${profileFilled}` : undefined,
    params.ai ? sql`${aiStatus} = ${params.ai}` : undefined,
    params.score === "scored" ? sql`${scoreSql} IS NOT NULL` : params.score === "none" ? sql`${scoreSql} IS NULL` : undefined,
    params.approval === "Pending"
      ? sql`coalesce(${approval}, 'Pending') NOT IN ('Approved', 'Rejected')`
      : params.approval === "Approved" || params.approval === "Rejected"
        ? sql`${approval} = ${params.approval}`
        : undefined,
    params.hired === "yes" ? hiredExists : params.hired === "no" ? sql`not ${hiredExists}` : undefined,
    params.offer === "full_time" ? fullTime : params.offer === "internship" ? and(hiredExists, sql`not ${fullTime}`) : undefined,
    params.payment === "paid" ? feePaid : params.payment === "unpaid" ? sql`not ${feePaid}` : undefined,
    dueCondition,
  ].filter(Boolean) as SQL[];
  const where = and(...conditions);

  const valuesOf = (pick: (m: InternMoney) => string | number | null, cast: "bigint" | "date") => {
    const entries = [...money.entries()].filter(([, m]) => pick(m) !== null && pick(m) !== 0);
    if (!entries.length) return sql`NULL`;
    const castSql = sql.raw(cast);
    return sql`(SELECT v.x FROM (VALUES ${sql.join(
      entries.map(([id, m]) => sql`(${id}, ${pick(m)}::${castSql})`),
      sql`, `,
    )}) AS v(id, x) WHERE v.id = ${u.id})`;
  };
  const order = (expr: SQL | SQL.Aliased | typeof u.createdAt) => (dir === "asc" ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`);
  const orderBy: SQL[] =
    sortKey === "name"
      ? [order(sql`lower(${u.firstName} || ' ' || ${u.lastName})`)]
      : sortKey === "email"
        ? [order(sql`lower(${u.email})`)]
        : sortKey === "score"
          ? [order(scoreSql)]
          : sortKey === "owed"
            ? [order(valuesOf((m) => m.owedMinor, "bigint"))]
            : sortKey === "next"
              ? [order(valuesOf((m) => m.nextDate, "date"))]
              : [dir === "asc" ? asc(u.createdAt) : desc(u.createdAt)];

  if (opts.maxRows != null) {
    const [c] = await db.select({ c: count() }).from(u).leftJoin(o, eq(o.userId, u.id)).where(where);
    if (Number(c?.c ?? 0) > opts.maxRows) return { rows: [] as InternRow[], total: Number(c?.c ?? 0), signups: 0, incomplete: 0 };
  }

  const [rawRows, [totalRow], [signupsRow], [incompleteRow]] = await Promise.all([
    db
      .select({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: sql<string>`trim(coalesce(${u.countryCode}, '') || ' ' || coalesce(${u.phoneNumber}, ''))`,
        isActive: u.isActive,
        visibility: u.profileVisibility,
        createdAt: u.createdAt,
        hasOnboarding: sql<boolean>`${o.id} IS NOT NULL`,
        hasProfile: profileFilled,
        openToWork,
        aiStatus,
        interviewAt: aiInterviewAt(),
        score: scoreSql,
        ratings: sql<Record<string, number> | null>`${o.extraData}->'ratings'`,
        approval,
        offerStatus,
        hired: hiredExists,
        fullTime,
        projectStatus,
        feePaid,
        ...(opts.bank
          ? {
              bankHolder: bankField("accountHolderName"),
              bankAccount: bankField("accountNumber"),
              bankIfsc: bankField("ifscCode"),
              bankName: bankField("bankName"),
              bankUpi: bankField("upiId"),
            }
          : {}),
      })
      .from(u)
      .leftJoin(o, eq(o.userId, u.id))
      .where(where)
      .orderBy(...orderBy, desc(u.id))
      .limit(req.limit)
      .offset(req.offset),
    db.select({ c: count() }).from(u).leftJoin(o, eq(o.userId, u.id)).where(where),
    db.select({ c: count() }).from(u).where(eq(u.role, "intern")),
    db
      .select({ c: count() })
      .from(u)
      .leftJoin(o, eq(o.userId, u.id))
      .where(sql`${u.role} = 'intern' and not ${profileFilled}`),
  ]);

  const rows: InternRow[] = rawRows.map((r) => {
    const { bankHolder, bankAccount, bankIfsc, bankName, bankUpi, ...rest } = r as typeof r & Record<string, string | undefined>;
    return {
      ...(rest as typeof r),
      ratings: r.ratings && typeof r.ratings === "object" ? r.ratings : null,
      interviewAt: r.interviewAt ? new Date(r.interviewAt) : null, // a raw sql column is not type-mapped
      money: money.get(r.id) ?? null,
      ...(opts.bank
        ? {
            bank: {
              holder: bankHolder ?? "",
              account: opts.fullAccount ? (bankAccount ?? "") : maskTail(bankAccount),
              ifsc: bankIfsc ?? "",
              name: bankName ?? "",
              upi: bankUpi ?? "",
            },
          }
        : {}),
    };
  });

  return {
    rows,
    total: Number(totalRow?.c ?? 0),
    signups: Number(signupsRow?.c ?? 0),
    incomplete: Number(incompleteRow?.c ?? 0),
  };
}
