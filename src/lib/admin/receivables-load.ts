import { eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { computeReceivables } from "@/lib/admin/receivables";
import { inrMinorSql, meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { istDayKeys, istDayStart, istKeySql, istMonthKeys, istMonthStart, PAID_STATUS, receivedAtSql, utcSql, type Bucket } from "@/lib/admin/revenue";

export type MoneyFilter = "both" | "company" | "candidate";

export function moneyFilter(v: string | undefined): MoneyFilter {
  return v === "company" || v === "candidate" ? v : "both";
}

/** Loads and computes the money-in / money-out report (test employers excluded). */
export async function loadReceivables(
  range: { since: Date | null; until: Date | null },
  filter: { receivables: MoneyFilter; payables: MoneyFilter },
) {
  const db = getDb();
  const [employers, interns, onboarding, proposals, employerPayments, internPayments, payouts, feeMinor] = await Promise.all([
    db.select({ id: schema.employers.id, name: schema.employers.companyName }).from(schema.employers).where(realEmployers()),
    db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.role, "intern")),
    db
      .select({
        userId: schema.internOnboarding.userId,
        createdAt: schema.internOnboarding.createdAt,
        extraData: schema.internOnboarding.extraData,
        meaningful: meaningfulProfile(),
      })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(eq(schema.users.role, "intern")),
    db
      .select({
        id: schema.proposals.id,
        employerId: schema.proposals.employerId,
        internId: schema.proposals.internId,
        status: schema.proposals.status,
        offerDetails: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
      })
      .from(schema.proposals)
      .where(inArray(schema.proposals.status, ["accepted", "processing", "hired"])),
    db
      .select({
        id: schema.employerPayments.id,
        employerId: schema.employerPayments.employerId,
        orderId: schema.employerPayments.orderId,
        paymentId: schema.employerPayments.paymentId,
        status: schema.employerPayments.status,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
        raw: schema.employerPayments.raw,
      })
      .from(schema.employerPayments)
      .where(realEmployerId(schema.employerPayments.employerId)),
    db
      .select({
        id: schema.internPayments.id,
        internId: schema.internPayments.internId,
        paymentId: schema.internPayments.paymentId,
        status: schema.internPayments.status,
        amountMinor: schema.internPayments.amountMinor,
        currency: schema.internPayments.currency,
        paidAt: schema.internPayments.paidAt,
        createdAt: schema.internPayments.createdAt,
      })
      .from(schema.internPayments),
    db.select().from(schema.internPayouts),
    getInternActivationFeeMinor(),
  ]);

  const employerName = new Map(employers.map((e) => [e.id, e.name]));
  const realIds = new Set(employers.map((e) => e.id));
  const internName = new Map(interns.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Candidate"]));
  const scores = new Map<string, number>();
  const paidInterns = new Set(internPayments.filter((p) => p.status === "paid").map((p) => p.internId));
  const unpaidProfiles: { userId: string; createdAt: Date | null }[] = [];
  for (const o of onboarding) {
    const extra = (o.extraData ?? {}) as Record<string, unknown>;
    scores.set(o.userId, Number(extra.findternScore) || 0);
    const paid = ((extra.payment ?? {}) as Record<string, unknown>).isPaid === true || paidInterns.has(o.userId);
    // Legacy listed every unpaid onboarding row; only real profiles here.
    if (!paid && o.meaningful) unpaidProfiles.push({ userId: o.userId, createdAt: o.createdAt });
  }

  return computeReceivables(
    {
      ...range,
      employerName: (id) => employerName.get(id) ?? "Company",
      internName: (id) => internName.get(id) ?? "Candidate",
      scoreOf: (id) => scores.get(id) ?? 0,
      activationFeeMinor: feeMinor,
      proposals: proposals.filter((p) => realIds.has(p.employerId)),
      employerPayments,
      internPayments,
      unpaidProfiles,
      payouts,
    },
    filter,
  );
}

// ----------------------------------------------------------------------
// The one money layer, over the database (definitions: lib/admin/revenue.ts).

/** Every paid employer order and intern fee as (source, inr_minor, received_at); test employers excluded. */
function paidReceipts(): SQL {
  const ep = schema.employerPayments;
  const ip = schema.internPayments;
  return sql`(
    SELECT 'employer' AS source, ${inrMinorSql(ep.amountMinor, ep.currency)} AS inr_minor, ${receivedAtSql(ep.paidAt, ep.createdAt)} AS received_at
      FROM ${ep} WHERE ${ep.status} = ${PAID_STATUS} AND ${realEmployerId(ep.employerId)}
    UNION ALL
    SELECT 'intern', ${inrMinorSql(ip.amountMinor, ip.currency)}, ${receivedAtSql(ip.paidAt, ip.createdAt)}
      FROM ${ip} WHERE ${ip.status} = ${PAID_STATUS}
  ) receipts`;
}

const within = (since: Date | null, until: Date | null): SQL => sql`${since ? sql`received_at >= ${utcSql(since)}` : sql`true`} AND ${until ? sql`received_at < ${utcSql(until)}` : sql`true`}`;

export type Collected = { receivedMinor: number; receivedCount: number; employerMinor: number; internMinor: number };

/** Money received (paid rows, INR) with received_at in [since, until); null bounds are open. */
export async function loadCollected(range: { since?: Date | null; until?: Date | null } = {}): Promise<Collected> {
  const { rows } = await getDb().execute<{ total: string | number; n: string | number; employer: string | number; intern: string | number }>(sql`
    SELECT coalesce(sum(inr_minor), 0)::bigint AS total,
           count(*)::int AS n,
           coalesce(sum(inr_minor) FILTER (WHERE source = 'employer'), 0)::bigint AS employer,
           coalesce(sum(inr_minor) FILTER (WHERE source = 'intern'), 0)::bigint AS intern
      FROM ${paidReceipts()} WHERE ${within(range.since ?? null, range.until ?? null)}`);
  const r = rows[0];
  return { receivedMinor: Number(r?.total ?? 0), receivedCount: Number(r?.n ?? 0), employerMinor: Number(r?.employer ?? 0), internMinor: Number(r?.intern ?? 0) };
}

/** Received in the last `days` India days including today (the "last 7 days" window). */
export function loadCollectedLastDays(days: number, now: Date = new Date()): Promise<Collected> {
  return loadCollected({ since: istDayStart(istDayKeys(now, days)[0]) });
}

/** Received per India month / day, as maps keyed `YYYY-MM` / `YYYY-MM-DD`. */
export async function loadReceiptBuckets(unit: "month" | "day", count: number, now: Date = new Date()): Promise<Map<string, Bucket>> {
  const keys = unit === "month" ? istMonthKeys(now, count) : istDayKeys(now, count);
  const since = unit === "month" ? istMonthStart(keys[0]) : istDayStart(keys[0]);
  const { rows } = await getDb().execute<{ key: string; total: string | number; n: string | number }>(sql`
    SELECT ${istKeySql(sql`received_at`, unit)} AS key, coalesce(sum(inr_minor), 0)::bigint AS total, count(*)::int AS n
      FROM ${paidReceipts()} WHERE ${within(since, null)} GROUP BY 1`);
  return new Map(rows.map((r) => [r.key, { totalMinor: Number(r.total), count: Number(r.n) }]));
}

/** Payouts to interns: settled (paid) and still pending, INR. */
export async function loadPayoutTotals() {
  const p = schema.internPayouts;
  const { rows } = await getDb().execute<{ paid: string | number; paid_n: string | number; pending: string | number; pending_n: string | number; n: string | number }>(sql`
    SELECT coalesce(sum(${inrMinorSql(p.amountMinor, p.currency)}) FILTER (WHERE ${p.status} = ${PAID_STATUS}), 0)::bigint AS paid,
           count(*) FILTER (WHERE ${p.status} = ${PAID_STATUS})::int AS paid_n,
           coalesce(sum(${inrMinorSql(p.amountMinor, p.currency)}) FILTER (WHERE ${p.status} = 'pending'), 0)::bigint AS pending,
           count(*) FILTER (WHERE ${p.status} = 'pending')::int AS pending_n,
           count(*)::int AS n
      FROM ${p}`);
  const r = rows[0];
  return {
    paidOutMinor: Number(r?.paid ?? 0),
    paidOutCount: Number(r?.paid_n ?? 0),
    pendingMinor: Number(r?.pending ?? 0),
    pendingCount: Number(r?.pending_n ?? 0),
    totalCount: Number(r?.n ?? 0),
  };
}
