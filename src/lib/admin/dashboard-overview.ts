import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { dbTimestamp, getDb, schema } from "@/lib/db";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import {
  buildPipelineBand,
  istWeekStart,
  placementSummary,
  toNextInterview,
  weekBars,
  type ActivityInput,
  type NextInterview,
  type PipelineBand,
  type PlacementSummary,
  type WeekBar,
} from "@/lib/admin/dashboard-overview-pure";
import { DAY_MS } from "@/lib/admin/dashboard-queues-pure";

/**
 * The dashboard's reads beyond the seven queues (`dashboard-queues.ts`). All read-only.
 *
 * `loadActivityAndCounts` is what the page already ran (signups, incomplete profiles and the four
 * "recent" lists); a failure there fails the page, as before. The overview reads below it each
 * stand alone: one that fails is `null` and its panel says so, it never reads as zero.
 */

export async function loadActivityAndCounts(now: Date) {
  const db = getDb();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [[signups], [incompleteProfiles], recentUsers, recentProjects, recentAccepted, recentPayments] = await Promise.all([
    db
      .select({ value: count(), fresh: sql<number>`count(*) filter (where ${schema.users.createdAt} >= ${weekAgo})` })
      .from(schema.users)
      .where(eq(schema.users.role, "intern")),
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(sql`${schema.users.role} = 'intern' and not ${meaningfulProfile()}`),
    db
      .select({
        id: schema.users.id,
        name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
        date: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.role, "intern"))
      .orderBy(desc(schema.users.createdAt))
      .limit(6),
    db
      .select({
        name: schema.projects.projectName,
        company: schema.employers.companyName,
        date: schema.projects.createdAt,
        employerId: schema.projects.employerId,
      })
      .from(schema.projects)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
      .where(realEmployerId(schema.projects.employerId))
      .orderBy(desc(schema.projects.createdAt))
      .limit(6),
    db
      .select({
        internId: schema.proposals.internId,
        first: schema.users.firstName,
        last: schema.users.lastName,
        company: schema.employers.companyName,
        date: schema.proposals.updatedAt,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .where(and(sql`${schema.proposals.status} in ('accepted', 'hired')`, realEmployerId(schema.proposals.employerId)))
      .orderBy(desc(schema.proposals.updatedAt))
      .limit(6),
    db
      .select({
        employerId: schema.employerPayments.employerId,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        company: schema.employers.companyName,
        date: schema.employerPayments.paidAt,
      })
      .from(schema.employerPayments)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
      .where(eq(schema.employerPayments.status, "paid"))
      .orderBy(desc(schema.employerPayments.paidAt))
      .limit(6),
  ]);
  const activity: ActivityInput = { recentUsers, recentProjects, recentAccepted, recentPayments };
  return {
    signups: Number(signups?.value ?? 0),
    signupsThisWeek: Number(signups?.fresh ?? 0),
    incompleteProfiles: Number(incompleteProfiles?.value ?? 0),
    activity,
  };
}

/** A read that may fail on its own: logged, then `null`. */
async function settleNull<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[admin/dashboard] ${what} failed`, error);
    return null;
  }
}

/** Proposals created per India day of the current Monday-to-Sunday week (real employers only). */
async function loadWeekProposals(now: Date): Promise<{ bars: WeekBar[]; total: number }> {
  const start = istWeekStart(now);
  if (!start) return weekBars(now, []);
  const pr = schema.proposals;
  const day = sql<string>`to_char(${pr.createdAt} + interval '330 minutes', 'YYYY-MM-DD')`;
  const rows = await getDb()
    .select({ day, value: count() })
    .from(pr)
    .where(and(gte(pr.createdAt, start), realEmployerId(pr.employerId)))
    .groupBy(day);
  return weekBars(now, rows.map((r) => ({ day: r.day, value: Number(r.value) })));
}

/** The soonest scheduled interview with a selected slot still ahead (real employers only). */
async function loadNextInterview(now: Date): Promise<NextInterview | null> {
  const iv = schema.interviews;
  const slot = sql`(CASE ${iv.selectedSlot} WHEN 1 THEN ${iv.slot1} WHEN 2 THEN ${iv.slot2} WHEN 3 THEN ${iv.slot3} END)`;
  const [row] = await getDb()
    .select({
      id: iv.id,
      internId: iv.internId,
      first: schema.users.firstName,
      last: schema.users.lastName,
      company: schema.employers.companyName,
      slot: sql<Date | null>`${slot}`,
      meetingLink: iv.meetingLink,
    })
    .from(iv)
    .leftJoin(schema.users, eq(schema.users.id, iv.internId))
    .leftJoin(schema.employers, eq(schema.employers.id, iv.employerId))
    .where(and(eq(iv.status, "scheduled"), realEmployerId(iv.employerId), sql`${slot} > now()`))
    .orderBy(slot, iv.id)
    .limit(1);
  return toNextInterview(row ? { ...row, slot: dbTimestamp(row.slot) } : null, now);
}

/** Placements: employer-paid (`hired`) and accepted, not yet paid (`accepted`, the same set as the queue of that name). */
async function loadPlacements(): Promise<PlacementSummary> {
  const pr = schema.proposals;
  const [row] = await getDb()
    .select({
      paid: sql<number>`count(*) filter (where ${pr.status} = 'hired')`,
      awaiting: sql<number>`count(*) filter (where ${pr.status} = 'accepted')`,
    })
    .from(pr)
    .where(realEmployerId(pr.employerId));
  return placementSummary({ paid: Number(row?.paid ?? 0), awaiting: Number(row?.awaiting ?? 0) });
}

async function loadCompanies(now: Date): Promise<{ total: number; fresh: number }> {
  const e = schema.employers;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [row] = await getDb()
    .select({ total: count(), fresh: sql<number>`count(*) filter (where ${e.createdAt} >= ${weekAgo})` })
    .from(e)
    .where(realEmployers());
  return { total: Number(row?.total ?? 0), fresh: Number(row?.fresh ?? 0) };
}

/**
 * The hire pipeline band: every open proposal (sent, interview, accepted, processing) with its offer,
 * plus the all-time hired count and the latest three hires. Open stages are bounded by the live
 * pipeline; Hired is not, so it reads its count and a short list, never every row. Real employers only.
 * Not yet part of `loadOverview`: the dashboard's pipeline band will call it when it is built, so
 * today's page runs no extra query for it.
 */
export async function loadPipelineBand(now: Date): Promise<PipelineBand> {
  const pr = schema.proposals;
  const base = {
    id: pr.id,
    status: pr.status,
    internId: pr.internId,
    first: schema.users.firstName,
    last: schema.users.lastName,
    company: schema.employers.companyName,
    since: pr.updatedAt,
    offerDetails: pr.offerDetails,
    currency: pr.currency,
  };
  const [open, latestHired, [hired]] = await Promise.all([
    getDb()
      .select(base)
      .from(pr)
      .leftJoin(schema.users, eq(schema.users.id, pr.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, pr.employerId))
      .where(and(inArray(pr.status, ["sent", "draft", "interview_scheduled", "accepted", "processing"]), realEmployerId(pr.employerId)))
      .orderBy(asc(pr.updatedAt), pr.id),
    getDb()
      .select(base)
      .from(pr)
      .leftJoin(schema.users, eq(schema.users.id, pr.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, pr.employerId))
      .where(and(eq(pr.status, "hired"), realEmployerId(pr.employerId)))
      .orderBy(desc(pr.updatedAt), pr.id)
      .limit(3),
    getDb().select({ value: count() }).from(pr).where(and(eq(pr.status, "hired"), realEmployerId(pr.employerId))),
  ]);
  const rows = [...open, ...latestHired].map((r) => ({ ...r, since: dbTimestamp(r.since) }));
  return buildPipelineBand(rows, Number(hired?.value ?? 0), now);
}

export async function loadOverview(now: Date) {
  const [week, nextInterview, placements, companies] = await Promise.all([
    settleNull("week proposals", () => loadWeekProposals(now)),
    // `undefined` is "no interview booked"; `null` is "could not load".
    settleNull("next interview", async () => (await loadNextInterview(now)) ?? undefined),
    settleNull("placements", loadPlacements),
    settleNull("companies", () => loadCompanies(now)),
  ]);
  return { week, nextInterview, placements, companies };
}
