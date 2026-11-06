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
  const [employers, interns, onboarding, proposals, employerPayments, internPayments, payouts, feeMinor, collegeBatches, collegePayouts, colleges] = await Promise.all([
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
        hiredAt: schema.proposals.hiredAt,
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
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.status, PAID_STATUS)),
    db.select().from(schema.collegePayouts).where(eq(schema.collegePayouts.status, PAID_STATUS)),
    db.select({ id: schema.colleges.id, name: schema.colleges.name }).from(schema.colleges),
  ]);
  const collegeNames = new Map(colleges.map((c) => [c.id, c.name]));

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
      collegeBatches,
      collegePayouts,
      collegeName: (id) => collegeNames.get(id) ?? "College",
    },
    filter,
  );
}

// ----------------------------------------------------------------------
// The one money layer, over the database (definitions: lib/admin/revenue.ts).

/** Every paid employer order, intern fee and college seat batch as (source, inr_minor, received_at); test employers excluded. */
function paidReceipts(): SQL {
  const ep = schema.employerPayments;
  const ip = schema.internPayments;
  const csb = schema.collegeSeatBatches;
  return sql`(
    SELECT 'employer' AS source, ${inrMinorSql(ep.amountMinor, ep.currency)} AS inr_minor, ${receivedAtSql(ep.paidAt, ep.createdAt)} AS received_at
      FROM ${ep} WHERE ${ep.status} = ${PAID_STATUS} AND ${realEmployerId(ep.employerId)}
    UNION ALL
    SELECT 'intern', ${inrMinorSql(ip.amountMinor, ip.currency)}, ${receivedAtSql(ip.paidAt, ip.createdAt)}
      FROM ${ip} WHERE ${ip.status} = ${PAID_STATUS}
    UNION ALL
    SELECT 'college', ${csb.amountMinor}, ${receivedAtSql(csb.paidAt, csb.createdAt)}
      FROM ${csb} WHERE ${csb.status} = ${PAID_STATUS}
  ) receipts`;
}

const within = (since: Date | null, until: Date | null): SQL => sql`${since ? sql`received_at >= ${utcSql(since)}` : sql`true`} AND ${until ? sql`received_at < ${utcSql(until)}` : sql`true`}`;

export type Collected = { receivedMinor: number; receivedCount: number; employerMinor: number; internMinor: number; collegeMinor: number };

/** Money received (paid rows, INR) with received_at in [since, until); null bounds are open. */
export async function loadCollected(range: { since?: Date | null; until?: Date | null } = {}): Promise<Collected> {
  const { rows } = await getDb().execute<{ total: string | number; n: string | number; employer: string | number; intern: string | number; college: string | number }>(sql`
    SELECT coalesce(sum(inr_minor), 0)::bigint AS total,
           count(*)::int AS n,
           coalesce(sum(inr_minor) FILTER (WHERE source = 'employer'), 0)::bigint AS employer,
           coalesce(sum(inr_minor) FILTER (WHERE source = 'intern'), 0)::bigint AS intern,
           coalesce(sum(inr_minor) FILTER (WHERE source = 'college'), 0)::bigint AS college
      FROM ${paidReceipts()} WHERE ${within(range.since ?? null, range.until ?? null)}`);
  const r = rows[0];
  return { receivedMinor: Number(r?.total ?? 0), receivedCount: Number(r?.n ?? 0), employerMinor: Number(r?.employer ?? 0), internMinor: Number(r?.intern ?? 0), collegeMinor: Number(r?.college ?? 0) };
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

/** Payouts to interns (settled and pending) plus paid college withdrawals, INR. College requests still open are not counted: the wallet, not this ledger, holds them. */
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
  // Withdrawals paid to colleges are money out too (the ledger of record is college_payouts, status 'paid').
  const cp = schema.collegePayouts;
  const { rows: cRows } = await getDb().execute<{ paid: string | number; n: string | number }>(sql`
    SELECT coalesce(sum(${cp.amountMinor}), 0)::bigint AS paid, count(*)::int AS n FROM ${cp} WHERE ${cp.status} = ${PAID_STATUS}`);
  return {
    paidOutMinor: Number(r?.paid ?? 0) + Number(cRows[0]?.paid ?? 0),
    paidOutCount: Number(r?.paid_n ?? 0) + Number(cRows[0]?.n ?? 0),
    pendingMinor: Number(r?.pending ?? 0),
    pendingCount: Number(r?.pending_n ?? 0),
    totalCount: Number(r?.n ?? 0) + Number(cRows[0]?.n ?? 0),
  };
}
