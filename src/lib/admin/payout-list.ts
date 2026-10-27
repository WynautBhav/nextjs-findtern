import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/lib/db";
import { inrMinorSql } from "@/lib/admin/scope";
import { searchAny } from "@/lib/admin/params";
import { isHiredProposal } from "@/lib/hire-status";
import { stipendDues, type StipendDue } from "@/lib/admin/stipend-dues";

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
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(`${v}T00:00:00Z`) : null;
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
  page: { offset: number; limit: number; sort: PayoutSort; dir: "asc" | "desc" },
) {
  const db = getDb();
  const where = payoutWhere(params);
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
      })
      .from(schema.internPayouts)
      .leftJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
      .leftJoin(payoutProposal, sql`${payoutProposal.id} = ${proposalRef}`)
      .leftJoin(
        payoutEmployer,
        sql`${payoutEmployer.id} = coalesce(nullif(${schema.internPayouts.raw}->>'employerId', ''), ${payoutProposal.employerId})`,
      )
      .leftJoin(payoutProject, eq(payoutProject.id, payoutProposal.projectId));

  const [rows, [totals]] = await Promise.all([
    base()
      .where(where)
      .orderBy(...payoutSort(page.sort, page.dir))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        paidMinor: sql<number>`coalesce(sum(CASE WHEN ${schema.internPayouts.status} = 'paid' THEN ${inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)} END), 0)::bigint`,
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
      .select({ employerId: schema.employerPayments.employerId, status: schema.employerPayments.status, raw: schema.employerPayments.raw })
      .from(schema.employerPayments)
      .where(and(inArray(schema.employerPayments.employerId, employerIds), eq(schema.employerPayments.status, "paid"))),
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
    for (const due of stipendDues(mine, theirPayouts, scoreOf.get(internId) ?? null, theirOrders)) {
      const p = mine.find((x) => x.id === due.proposalId)!;
      out.push({
        ...due,
        internId,
        internName: `${p.internFirst ?? ""} ${p.internLast ?? ""}`.trim() || "Candidate",
        companyName: p.companyName ?? "Company",
        projectName: p.projectName ?? "Project",
      });
    }
  }
  // Soonest money first; finished placements last.
  return out.sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
}
