import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  isDriveStatus,
  likeTerm,
  orderMetrics,
  shapeStudents,
  totals,
  type DriveStatus,
} from "@/lib/college/drive-dashboard";

const o = schema.collegeDriveOrders;
const e = schema.driveRosterEntries;
const c = schema.driveCodes;
const t = schema.driveEntitlements;

/** SQL mirror of deriveStatus(). */
const statusSql = sql<DriveStatus>`(CASE
  WHEN ${e.state} <> 'valid' THEN 'not_invited'
  WHEN lower(${t.interviewStatus}) IN ('completed','complete','done') THEN 'interview_completed'
  WHEN lower(${t.interviewStatus}) IN ('started','in_progress') THEN 'interview_started'
  WHEN ${t.id} IS NOT NULL OR ${c.status} = 'redeemed' THEN 'activated'
  WHEN ${c.status} = 'issued' THEN 'code_sent'
  ELSE 'not_invited' END)`;

export async function collegeHasDriveOrder(collegeId: string): Promise<boolean> {
  const [r] = await getDb().select({ id: o.id }).from(o).where(eq(o.collegeId, collegeId)).limit(1);
  return !!r;
}

/** Per-order metrics for one college; interviews grouped by interview_status. */
export async function collegeDriveMetrics(collegeId: string) {
  const db = getDb();
  const orders = await db
    .select({ id: o.id, slots: o.slots, issued: o.issuedCount, redeemed: o.redeemedCount, status: o.status, createdAt: o.createdAt })
    .from(o)
    .where(and(eq(o.collegeId, collegeId), sql`${o.status} IN ('paid','partially_refunded')`))
    .orderBy(asc(o.createdAt), asc(o.id));
  const interviews = await db
    .select({ orderId: t.orderId, status: t.interviewStatus, n: sql<number>`count(*)::int` })
    .from(t)
    .where(eq(t.collegeId, collegeId))
    .groupBy(t.orderId, t.interviewStatus);
  const [{ entries }] = await db
    .select({ entries: sql<number>`count(*)::int` })
    .from(e)
    .innerJoin(o, eq(o.id, e.orderId))
    .where(and(eq(o.collegeId, collegeId), eq(e.state, "valid")));
  const perOrder = orders.map((x) => ({
    ...orderMetrics(x),
    interviews: Object.fromEntries(interviews.filter((i) => i.orderId === x.id).map((i) => [i.status, i.n])),
  }));
  return { orders: perOrder, totals: totals(orders), rosterValid: entries };
}

export async function collegeDriveStudents(opts: { collegeId: string; search: string; status: string; offset: number; limit: number }) {
  const conds: SQL[] = [eq(o.collegeId, opts.collegeId)];
  if (opts.search.trim()) {
    const p = `%${likeTerm(opts.search)}%`;
    conds.push(sql`(${e.name} ILIKE ${p} OR ${e.collegeEmailNorm} ILIKE ${p})`);
  }
  if (isDriveStatus(opts.status)) conds.push(sql`${statusSql} = ${opts.status}`);
  const base = getDb()
    .select({
      id: e.id,
      collegeId: o.collegeId,
      name: e.name,
      email: e.collegeEmailNorm,
      entryState: e.state,
      codeStatus: c.status,
      interviewStatus: t.interviewStatus,
      redeemedAt: t.redeemedAt,
    })
    .from(e)
    .innerJoin(o, eq(o.id, e.orderId))
    .leftJoin(c, eq(c.entryId, e.id))
    .leftJoin(t, eq(t.codeId, c.id))
    .where(and(...conds));
  const rows = await base.orderBy(asc(e.name), asc(e.id)).limit(opts.limit).offset(opts.offset);
  const [{ total }] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(e)
    .innerJoin(o, eq(o.id, e.orderId))
    .leftJoin(c, eq(c.entryId, e.id))
    .leftJoin(t, eq(t.codeId, c.id))
    .where(and(...conds));
  return { rows: shapeStudents(rows, opts.collegeId), total };
}

/** Admin: one row per college with drive orders. */
export async function adminDriveOverview(opts: { q: string; status: string; offset: number; limit: number }) {
  const db = getDb();
  const conds: SQL[] = [sql`${o.status} IN ('paid','partially_refunded')`];
  if (opts.q.trim()) conds.push(sql`${schema.colleges.name} ILIKE ${`%${likeTerm(opts.q)}%`}`);
  const having: SQL[] = [];
  // status filter at college level: has at least one student in that status
  if (isDriveStatus(opts.status)) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${e} e2 JOIN ${o} o2 ON o2.id = e2.order_id
      LEFT JOIN ${c} c2 ON c2.entry_id = e2.id LEFT JOIN ${t} t2 ON t2.code_id = c2.id
      WHERE o2.college_id = ${o.collegeId} AND (CASE
        WHEN e2.state <> 'valid' THEN 'not_invited'
        WHEN lower(t2.interview_status) IN ('completed','complete','done') THEN 'interview_completed'
        WHEN lower(t2.interview_status) IN ('started','in_progress') THEN 'interview_started'
        WHEN t2.id IS NOT NULL OR c2.status = 'redeemed' THEN 'activated'
        WHEN c2.status = 'issued' THEN 'code_sent'
        ELSE 'not_invited' END) = ${opts.status})`);
  }
  void having;
  const where = and(...conds);
  const grouped = db
    .select({
      collegeId: o.collegeId,
      name: schema.colleges.name,
      slots: sql<number>`sum(${o.slots})::int`,
      issued: sql<number>`sum(${o.issuedCount})::int`,
      redeemed: sql<number>`sum(${o.redeemedCount})::int`,
    })
    .from(o)
    .innerJoin(schema.colleges, eq(schema.colleges.id, o.collegeId))
    .where(where)
    .groupBy(o.collegeId, schema.colleges.name);
  const rows = await grouped.orderBy(asc(schema.colleges.name), asc(o.collegeId)).limit(opts.limit).offset(opts.offset);
  const [agg] = await db
    .select({
      total: sql<number>`count(DISTINCT ${o.collegeId})::int`,
      slots: sql<number>`coalesce(sum(${o.slots}),0)::int`,
      issued: sql<number>`coalesce(sum(${o.issuedCount}),0)::int`,
      redeemed: sql<number>`coalesce(sum(${o.redeemedCount}),0)::int`,
    })
    .from(o)
    .innerJoin(schema.colleges, eq(schema.colleges.id, o.collegeId))
    .where(where);
  return {
    rows: rows.map((r) => ({ ...r, unused: Math.max(0, r.slots - r.issued), pending: Math.max(0, r.issued - r.redeemed) })),
    total: agg?.total ?? 0,
    totals: { slots: agg?.slots ?? 0, issued: agg?.issued ?? 0, redeemed: agg?.redeemed ?? 0, unused: Math.max(0, (agg?.slots ?? 0) - (agg?.issued ?? 0)) },
  };
}
