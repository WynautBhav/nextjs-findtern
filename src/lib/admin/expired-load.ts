import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { orderProposalIds } from "@/lib/order-ids";
import { realEmployerId } from "@/lib/admin/scope";
import { expiredProposals, type ExpiredRow, type ExpiredSource } from "@/lib/admin/tracker";

/** An unpaid order holds an accepted offer open for this long (payments.ts OPEN_ORDER_MINUTES; the sweeper freezes on the same window). */
const OPEN_ORDER_MINUTES = 30;

/**
 * Every offer that could read as expired, real employers only: sent / interview scheduled / accepted (they lapse on
 * the start date, computed on read), plus those already marked expired or withdrawn. Read-only.
 */
export async function loadExpiredSources(now: Date = new Date()): Promise<{ rows: ExpiredSource[]; openOrderIds: Set<string> }> {
  const db = getDb();
  const p = schema.proposals;
  const [rows, orders] = await Promise.all([
    db
      .select({
        id: p.id,
        status: p.status,
        currency: p.currency,
        offerDetails: p.offerDetails,
        hiredAt: p.hiredAt,
        updatedAt: p.updatedAt,
        internId: p.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        employerId: p.employerId,
        companyName: schema.employers.companyName,
        projectId: p.projectId,
        projectName: schema.projects.projectName,
        projectTimezone: schema.projects.timezone,
      })
      .from(p)
      .leftJoin(schema.users, eq(schema.users.id, p.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, p.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, p.projectId))
      .where(and(realEmployerId(p.employerId), inArray(p.status, ["sent", "interview_scheduled", "accepted", "expired", "withdrawn"]))),
    loadOpenOrderIds(now),
  ]);
  return { rows, openOrderIds: orders };
}

/**
 * Offers held by an unpaid checkout opened in the last OPEN_ORDER_MINUTES (the open-checkout freeze). Only the recent
 * open orders are read, so a caller that needs just this set (one project's offers) does not scan every offer.
 */
export async function loadOpenOrderIds(now: Date = new Date()): Promise<Set<string>> {
  const orders = await getDb()
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(and(eq(schema.employerPayments.status, "created"), gte(schema.employerPayments.createdAt, new Date(now.getTime() - OPEN_ORDER_MINUTES * 60_000))));
  return new Set(orders.flatMap((o) => orderProposalIds(o.raw)));
}

/** Expired offers at `now`: the one definition (tracker.expiredProposals) over the loaded rows. */
export async function loadExpiredProposals(now: Date): Promise<ExpiredRow[]> {
  const { rows, openOrderIds } = await loadExpiredSources(now);
  return expiredProposals(rows, now, openOrderIds);
}

/** Latest "link added" time per interview, from the audit log (the meeting-link route writes one per new or changed link). */
export async function linkAuditTimes(): Promise<Map<string, Date>> {
  const a = schema.adminAuditLog;
  const rows = await getDb()
    .select({ interviewId: sql<string>`${a.meta}->>'interviewId'`, at: sql<Date>`max(${a.createdAt})`.mapWith(a.createdAt) })
    .from(a)
    .where(eq(a.action, "interview.ai_link_added"))
    .groupBy(sql`${a.meta}->>'interviewId'`);
  return new Map(rows.filter((r) => r.interviewId).map((r) => [r.interviewId, new Date(r.at)]));
}
