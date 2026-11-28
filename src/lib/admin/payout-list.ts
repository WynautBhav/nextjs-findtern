import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/lib/db";
import { inrMinorSql } from "@/lib/admin/scope";
import { WAIVER_GATEWAY, waiverFlagOf } from "@/lib/full-waiver";
import { orderProposalIds } from "@/lib/order-ids";
import { searchAny } from "@/lib/admin/params";
import { isHiredProposal } from "@/lib/hire-status";
import { stipendDues, type StipendDue } from "@/lib/admin/stipend-dues";
import { SETTLED_STATUSES, settledOrders } from "@/lib/refund-accounting";
import { canPayOut } from "@/lib/admin/payout-kind";
import { istDayKey } from "@/lib/admin/payout-run";
import { bandCounts, duesHeatInput, heatBand, heatPageSplit, isOpenDue, ledgerHeatInput, parseHeatBand, payoutHeat, sortByHeat, type HeatBand } from "@/lib/admin/payout-heat";
import type { Heat } from "@/lib/admin/heat";

/**
 * The two lists on /admin/payouts, shared with their CSV export so the file
 * and the screen are always the same population.
 *
 *  - Disbursements: every `intern_payouts` row, paginated (no 500 cap), with
 *    totals over the whole filtered set (ADM-10), searchable by intern,
 *    reference, company and project (ADP-27).
 *  - Employer dues: one row per hired placement with its stipend months
 *    paid / owed and what the employer has paid (ADM-01, ADP-19).
 */

export const PAYOUT_SORTS = ["scheduled", "amount", "paid", "created"] as const;
export type PayoutSort = (typeof PAYOUT_SORTS)[number];

const proposalRef = sql`coalesce(${schema.internPayouts.raw}->>'proposalId', ${schema.internPayouts.raw}->>'proposal_id')`;
const scheduledSql = sql<string | null>`nullif(coalesce(${schema.internPayouts.raw}->>'scheduledFor', ${schema.internPayouts.raw}->>'scheduled_for'), '')`;

const payoutProposal = alias(schema.proposals, "payout_proposal");
const payoutEmployer = alias(schema.employers, "payout_employer");
const payoutProject = alias(schema.projects, "payout_project");

function dayParam(v: string | undefined): Date | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(`${v}T00:00:00+05:30`) : null; // IST midnight; India has no DST, so +1 day below is exact
}

function payoutWhere(params: Record<string, string>): SQL | undefined {
  const from = dayParam(params.from);
  const to = dayParam(params.to);
  const q = (params.q ?? "").trim();
  const parts = [
    ["pending", "paid", "failed"].includes(params.status ?? "") ? eq(schema.internPayouts.status, params.status) : undefined,
    params.currency === "INR" || params.currency === "USD" ? eq(schema.internPayouts.currency, params.currency) : undefined,
    from ? gte(schema.internPayouts.createdAt, from) : undefined,
    to ? lt(schema.internPayouts.createdAt, new Date(to.getTime() + 86_400_000)) : undefined,
    q
      ? searchAny(
          [
            sql`${schema.users.firstName}`,
            sql`${schema.users.lastName}`,
            sql`${schema.users.email}`,
            sql`${schema.internPayouts.referenceId}`,
            sql`${payoutEmployer.companyName}`,
            sql`${payoutProject.projectName}`,
          ],
          q,
        )
      : undefined,
  ].filter(Boolean) as SQL[];
  return parts.length ? and(...parts) : undefined;
}

function payoutSort(sort: PayoutSort, dir: "asc" | "desc"): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "amount":
      return [d(inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)), desc(schema.internPayouts.createdAt)];
    case "paid":
      return [sql`${schema.internPayouts.paidAt} ${sql.raw(dir)} nulls last`, desc(schema.internPayouts.createdAt)];
    case "created":
      return [d(schema.internPayouts.createdAt)];
    default:
      return [sql`${scheduledSql} ${sql.raw(dir)} nulls last`, desc(schema.internPayouts.createdAt)];
  }
}

export type PayoutRow = Awaited<ReturnType<typeof loadPayouts>>["rows"][number];

export async function loadPayouts(
  params: Record<string, string>,
  /** `limit: null` reads every matching row (the open set for heat). */
  page: { offset: number; limit: number | null; sort: PayoutSort; dir: "asc" | "desc" },
  /** Heat split: "open" = still to be paid (pending), "closed" = everything else. */
  scope?: "open" | "closed",
) {
  const db = getDb();
  const open = sql`lower(${schema.internPayouts.status}) = 'pending'`; // isOpenPayout
  const where = scope ? and(payoutWhere(params), scope === "open" ? open : sql`not (${open})`) : payoutWhere(params);
  const base = () =>
    db
      .select({
        id: schema.internPayouts.id,
        internId: schema.internPayouts.internId,
        internName: sql<string>`trim(coalesce(${schema.users.firstName}, '') || ' ' || coalesce(${schema.users.lastName}, ''))`,
        internEmail: schema.users.email,
        amountMinor: schema.internPayouts.amountMinor,
        currency: schema.internPayouts.currency,
        inrMinor: inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency),
        kind: schema.internPayouts.kind,
        status: schema.internPayouts.status,
        method: schema.internPayouts.method,
        referenceId: schema.internPayouts.referenceId,
        notes: schema.internPayouts.notes,
        raw: schema.internPayouts.raw,
        scheduledFor: scheduledSql,
        paidAt: schema.internPayouts.paidAt,
        createdAt: schema.internPayouts.createdAt,
        employerId: payoutEmployer.id,
        companyName: payoutEmployer.companyName,
        projectName: payoutProject.projectName,
        // The employer's order for this placement was completed by a full-waiver code: Findtern pays the intern, nobody paid Findtern.
        fundedByWaiver: sql<boolean>`(${proposalRef} is not null and exists (select 1 from employer_payments wp where wp.gateway = ${WAIVER_GATEWAY} and wp.status in ('paid', 'refunded', 'partially_refunded') and strpos(wp.raw::text, ${proposalRef}) > 0))`,
      })
      .from(schema.internPayouts)
      .leftJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
      .leftJoin(payoutProposal, sql`${payoutProposal.id} = ${proposalRef}`)
      .leftJoin(
        payoutEmployer,
        sql`${payoutEmployer.id} = coalesce(nullif(${schema.internPayouts.raw}->>'employerId', ''), ${payoutProposal.employerId})`,
      )
      .leftJoin(payoutProject, eq(payoutProject.id, payoutProposal.projectId));

  const ordered = () => base().where(where).orderBy(...payoutSort(page.sort, page.dir));
  const [rows, [totals]] = await Promise.all([
    page.limit === null ? ordered().offset(page.offset) : ordered().limit(page.limit).offset(page.offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        // Stipends and Findtern-paid completion bonuses are summed apart: the run desk's flow
        // (billed, owed, paid) is stipend-only, so a bonus must never inflate "paid out".
        paidMinor: sql<number>`coalesce(sum(CASE WHEN ${schema.internPayouts.status} = 'paid' AND ${schema.internPayouts.kind} = 'stipend' THEN ${inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)} END), 0)::bigint`,
        bonusPaidMinor: sql<number>`coalesce(sum(CASE WHEN ${schema.internPayouts.status} = 'paid' AND ${schema.internPayouts.kind} = 'completion_bonus' THEN ${inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)} END), 0)::bigint`,
        pendingMinor: sql<number>`coalesce(sum(CASE WHEN ${schema.internPayouts.status} = 'pending' THEN ${inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)} END), 0)::bigint`,
        pendingCount: sql<number>`count(*) FILTER (WHERE ${schema.internPayouts.status} = 'pending')::int`,
        failedCount: sql<number>`count(*) FILTER (WHERE ${schema.internPayouts.status} = 'failed')::int`,
      })
      .from(schema.internPayouts)
      .leftJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
      .leftJoin(payoutProposal, sql`${payoutProposal.id} = ${proposalRef}`)
      .leftJoin(
        payoutEmployer,
        sql`${payoutEmployer.id} = coalesce(nullif(${schema.internPayouts.raw}->>'employerId', ''), ${payoutProposal.employerId})`,
      )
      .leftJoin(payoutProject, eq(payoutProject.id, payoutProposal.projectId))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => {
      const raw = (r.raw ?? {}) as Record<string, unknown>;
      return {
        ...r,
        inrMinor: Number(r.inrMinor ?? 0),
        source: typeof raw.source === "string" ? raw.source : null,
        opsNote: typeof raw.opsNote === "string" ? raw.opsNote : null,
      };
    }),
    total: Number(totals?.count ?? 0),
    paidMinor: Number(totals?.paidMinor ?? 0),
    bonusPaidMinor: Number(totals?.bonusPaidMinor ?? 0),
    pendingMinor: Number(totals?.pendingMinor ?? 0),
    pendingCount: Number(totals?.pendingCount ?? 0),
    failedCount: Number(totals?.failedCount ?? 0),
  };
}

/** Human label for `raw.source`. */
export function payoutSourceLabel(source: string | null): string {
  switch (source) {
    case "employer_due":
      return "Placement dues";
    case "auto-next-month":
      return "Next month (auto)";
    case "admin":
      return "Manual";
    case null:
    case "":
      return "Manual";
    default:
      return source.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}

/* ── Employer dues: one row per hired placement ─────────────────────── */

export const DUE_FILTERS = ["all", "active", "upcoming", "completed"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export type PlacementDueRow = StipendDue & {
  internId: string;
  internName: string;
  companyName: string;
  projectName: string;
  /** The company's order for this placement was completed by a full-waiver code: Findtern pays the intern, nobody paid Findtern. */
  fundedByWaiver?: boolean;
};

export function filterDues(rows: PlacementDueRow[], filter: DueFilter, q: string): PlacementDueRow[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((d) => {
    if (words.length) {
      const hay = `${d.internName} ${d.companyName} ${d.projectName}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    // Legacy admin-payouts.tsx:211-226.
    if (filter === "upcoming") return d.remainingMinor > 0;
    if (filter === "completed") return d.remainingMonths <= 0;
    if (filter === "active") return d.remainingMonths > 0;
    return true;
  });
}

export function duesTotals(rows: PlacementDueRow[]) {
  return rows.reduce(
    (t, d) => ({
      totalMinor: t.totalMinor + d.totalShareMinor,
      paidMinor: t.paidMinor + d.paidMinor,
      dueMinor: t.dueMinor + d.remainingMinor,
      employerDueInrMinor: t.employerDueInrMinor + (d.employer?.dueInrMinor ?? 0),
      active: t.active + (d.remainingMonths > 0 ? 1 : 0),
      completed: t.completed + (d.remainingMonths <= 0 ? 1 : 0),
    }),
    { totalMinor: 0, paidMinor: 0, dueMinor: 0, employerDueInrMinor: 0, active: 0, completed: 0 },
  );
}

/** Every hired placement, or one intern's (Candidate 360). */
export async function loadPlacementDues(internId?: string): Promise<PlacementDueRow[]> {
  const db = getDb();
  const proposals = await db
    .select({
      id: schema.proposals.id,
      status: schema.proposals.status,
      hiredAt: schema.proposals.hiredAt,
      internId: schema.proposals.internId,
      employerId: schema.proposals.employerId,
      offerDetails: schema.proposals.offerDetails,
      currency: schema.proposals.currency,
      createdAt: schema.proposals.createdAt,
      internFirst: schema.users.firstName,
      internLast: schema.users.lastName,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
    })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(
      and(
        or(eq(schema.proposals.status, "hired"), sql`${schema.proposals.hiredAt} IS NOT NULL`),
        internId ? eq(schema.proposals.internId, internId) : undefined,
      ),
    )
    .orderBy(desc(schema.proposals.createdAt));
  const hired = proposals.filter((p) => isHiredProposal(p));
  if (hired.length === 0) return [];

  const internIds = [...new Set(hired.map((p) => p.internId))];
  const employerIds = [...new Set(hired.map((p) => p.employerId))];
  const [payouts, onboarding, orders] = await Promise.all([
    db
      .select({
        id: schema.internPayouts.id,
        internId: schema.internPayouts.internId,
        status: schema.internPayouts.status,
        kind: schema.internPayouts.kind,
        raw: schema.internPayouts.raw,
        amountMinor: schema.internPayouts.amountMinor,
        currency: schema.internPayouts.currency,
        paidAt: schema.internPayouts.paidAt,
        createdAt: schema.internPayouts.createdAt,
      })
      .from(schema.internPayouts)
      .where(inArray(schema.internPayouts.internId, internIds)),
    db
      .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(inArray(schema.internOnboarding.userId, internIds)),
    db
      .select({ employerId: schema.employerPayments.employerId, status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt })
      .from(schema.employerPayments)
      .where(and(inArray(schema.employerPayments.employerId, employerIds), inArray(schema.employerPayments.status, SETTLED_STATUSES))),
  ]);

  const scoreOf = new Map(
    onboarding.map((o) => {
      const s = Number(((o.extraData ?? {}) as Record<string, unknown>).findternScore);
      return [o.userId, Number.isFinite(s) ? s : null] as const;
    }),
  );

  const out: PlacementDueRow[] = [];
  for (const internId of internIds) {
    const mine = hired.filter((p) => p.internId === internId);
    const theirPayouts = payouts.filter((p) => p.internId === internId);
    const theirOrders = orders.filter((o) => mine.some((p) => p.employerId === o.employerId));
    for (const due of stipendDues(mine, theirPayouts, scoreOf.get(internId) ?? null, settledOrders(theirOrders))) {
      const p = mine.find((x) => x.id === due.proposalId)!;
      out.push({
        ...due,
        internId,
        internName: `${p.internFirst ?? ""} ${p.internLast ?? ""}`.trim() || "Candidate",
        companyName: p.companyName ?? "Company",
        projectName: p.projectName ?? "Project",
        fundedByWaiver: theirOrders.some((o) => waiverFlagOf(o.raw) !== null && orderProposalIds(o.raw as Record<string, unknown>).includes(due.proposalId)),
      });
    }
  }
  // Soonest money first; finished placements last.
  return out.sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
}

/** Pending and paid ledger totals per intern, INR paise: the same sums the Disbursements totals use. */
export async function loadLedgerByIntern(): Promise<Map<string, { pendingMinor: number; paidMinor: number }>> {
  const inr = inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency);
  const rows = await getDb()
    .select({
      internId: schema.internPayouts.internId,
      pendingMinor: sql<number>`coalesce(sum(${inr}) FILTER (WHERE ${schema.internPayouts.status} = 'pending'), 0)::bigint`,
      paidMinor: sql<number>`coalesce(sum(${inr}) FILTER (WHERE ${schema.internPayouts.status} = 'paid'), 0)::bigint`,
    })
    .from(schema.internPayouts)
    // Left-to-pay on the Interns table is stipends only; a bonus has its own payout row.
    .where(eq(schema.internPayouts.kind, "stipend"))
    .groupBy(schema.internPayouts.internId);
  return new Map(rows.map((r) => [r.internId, { pendingMinor: Number(r.pendingMinor), paidMinor: Number(r.paidMinor) }]));
}

/* ── Heat (payout-heat.ts): which unpaid stipends to deal with first ── */

/**
 * canPayOut's reason per intern (null = bank details on file), the same check the mark-paid route enforces. Read only
 * for the interns with an open row; the bank details themselves never leave this function.
 */
export async function loadBankProblems(internIds: string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(internIds)].filter(Boolean);
  const out = new Map<string, string | null>(ids.map((id) => [id, "Intern has no bank details on file"]));
  if (!ids.length) return out;
  const rows = await getDb()
    .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(inArray(schema.internOnboarding.userId, ids));
  for (const r of rows) {
    const ok = canPayOut((r.extraData ?? {}) as Record<string, unknown>);
    out.set(r.userId, ok.ok ? null : ok.error);
  }
  return out;
}

export const PAYOUT_LIST_SORTS = ["heat", ...PAYOUT_SORTS] as const;
export type PayoutListSort = (typeof PAYOUT_LIST_SORTS)[number];
export type HeatedPayoutRow = PayoutRow & { heat: Heat | null };


/**
 * The payouts ledger with heat, for the page, its CSV and the verify script. Open (pending) rows are all read and
 * scored; closed rows stay paginated in SQL. `params.heat` (hot | warm | calm | closed) filters; sort "heat" puts
 * open rows hottest first, then closed rows newest first. The ledger figures (paid, pending, failed) and `allTotal`
 * ignore the heat filter, as the cards do.
 */
export async function loadPayoutsWithHeat(
  params: Record<string, string>,
  page: { offset: number; limit: number; sort: PayoutListSort; dir: "asc" | "desc" },
  now: Date = new Date(),
) {
  const today = istDayKey(now);
  const band = parseHeatBand(params.heat);
  const byHeat = page.sort === "heat";
  // Open rows come from SQL soonest date first, so equal heat keeps the earlier pay date on top.
  const sqlSort: PayoutSort = page.sort === "heat" ? "scheduled" : page.sort;
  const [all, open] = await Promise.all([
    loadPayouts(params, { offset: 0, limit: 0, sort: sqlSort, dir: page.dir }),
    // Pending payouts are few at any time; every one is read (no cap) so heat sorts, filters and counts the whole open set.
    loadPayouts(params, { offset: 0, limit: null, sort: sqlSort, dir: byHeat ? "asc" : page.dir }, "open"),
  ]);
  if (open.rows.length !== open.total) throw new Error(`Payout heat: read ${open.rows.length} of ${open.total} open payouts`);
  const bank = await loadBankProblems(open.rows.map((r) => r.internId));
  const openRows: HeatedPayoutRow[] = open.rows.map((r) => ({ ...r, heat: payoutHeat(ledgerHeatInput(r, bank.get(r.internId) ?? null), today) }));
  const bands: Record<HeatBand, number> = { ...bandCounts(openRows.map((r) => r.heat)), closed: all.total - open.total };
  const closedSort = { sort: (byHeat ? "created" : sqlSort) as PayoutSort, dir: byHeat ? ("desc" as const) : page.dir };

  let rows: HeatedPayoutRow[];
  let total: number;
  if (band && band !== "closed") {
    const list = openRows.filter((r) => heatBand(r.heat) === band);
    rows = (byHeat ? sortByHeat(list, page.dir) : list).slice(page.offset, page.offset + page.limit);
    total = list.length;
  } else if (band === "closed") {
    const closed = await loadPayouts(params, { offset: page.offset, limit: page.limit, ...closedSort }, "closed");
    rows = closed.rows.map((r) => ({ ...r, heat: null }));
    total = closed.total;
  } else if (byHeat) {
    const ordered = sortByHeat(openRows, page.dir);
    const split = heatPageSplit(ordered.length, page.offset, page.limit);
    const head = ordered.slice(split.openStart, split.openEnd);
    const tail = split.closedLimit > 0 ? (await loadPayouts(params, { offset: split.closedOffset, limit: split.closedLimit, ...closedSort }, "closed")).rows : [];
    rows = [...head, ...tail.map((r) => ({ ...r, heat: null }))];
    total = all.total;
  } else {
    const heatOf = new Map(openRows.map((r) => [r.id, r.heat]));
    const pageRows = await loadPayouts(params, { offset: page.offset, limit: page.limit, sort: sqlSort, dir: page.dir });
    rows = pageRows.rows.map((r) => ({ ...r, heat: heatOf.get(r.id) ?? null }));
    total = all.total;
  }
  return { ...all, rows, total, allTotal: all.total, bands };
}

export type HeatedDueRow = PlacementDueRow & { heat: Heat | null };

/** Heat on each placement (open while a stipend month is owed). Bank details are read only for open placements. */
export async function heatDues(rows: PlacementDueRow[], now: Date = new Date()): Promise<HeatedDueRow[]> {
  const today = istDayKey(now);
  const bank = await loadBankProblems(rows.filter(isOpenDue).map((d) => d.internId));
  return rows.map((d) => ({ ...d, heat: payoutHeat(duesHeatInput(d, bank.get(d.internId) ?? null), today) }));
}

export { DUE_SORTS, dueHeatView, type DueSort } from "@/lib/admin/payout-heat";
