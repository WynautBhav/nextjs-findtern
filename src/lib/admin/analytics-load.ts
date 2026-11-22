import { and, count, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { SETTLED_STATUSES } from "@/lib/refund-accounting";
import { computeAnalytics, type AnalyticsInput } from "@/lib/admin/analytics";
import { legacyFeeFlag } from "@/lib/admin/fee-flag";
import { periodStart } from "@/lib/admin/params";
import { isMoneyReceived, istDateRange, istMonthKeys, istMonthStart } from "@/lib/admin/revenue";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";

/** Range from `?from=&to=` (`YYYY-MM-DD` India dates, inclusive; the date filter only sends that form), `?period=30d`, or `?period=all`; default the last 18 months (legacy). */
export function analyticsRange(params: Record<string, string | undefined>): { since: Date | null; until: Date | null } {
  // India calendar days, inclusive, exactly as Reports and Transactions read them (lib/admin/revenue).
  const custom = istDateRange(params.from, params.to);
  if (custom.since || custom.until) return custom;
  const preset = periodStart(params.period);
  if (preset) return { since: preset, until: null };
  if (params.period === "all") return { since: null, until: null };
  // Legacy default: the last 18 months.
  return { since: istMonthStart(istMonthKeys(new Date(), 18)[0]), until: null };
}

/**
 * Everything the analytics need, test employers excluded, in one pass. Sized
 * for this platform's volumes (hundreds to low thousands of rows); if that
 * changes, move the counting into SQL rather than paging this.
 */
export async function loadAnalytics(range: { since: Date | null; until: Date | null }) {
  const db = getDb();
  const hasCity = sql`trim(coalesce(${schema.internOnboarding.city}, '')) <> ''`;
  const [interns, onboarding, employers, projects, proposals, interviews, employerPayments, internPayments, collegeBatches, cityRows, [cityTotal]] = await Promise.all([
    db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.role, "intern")),
    db
      .select({
        userId: schema.internOnboarding.userId,
        createdAt: schema.internOnboarding.createdAt,
        meaningful: meaningfulProfile(),
        extraData: schema.internOnboarding.extraData,
      })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(eq(schema.users.role, "intern")),
    db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName, createdAt: schema.employers.createdAt })
      .from(schema.employers)
      .where(realEmployers()),
    db
      .select({
        id: schema.projects.id,
        employerId: schema.projects.employerId,
        status: schema.projects.status,
        skills: schema.projects.skills,
        city: schema.projects.city,
        state: schema.projects.state,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .where(realEmployerId(schema.projects.employerId)),
    db
      .select({
        id: schema.proposals.id,
        employerId: schema.proposals.employerId,
        internId: schema.proposals.internId,
        projectId: schema.proposals.projectId,
        status: schema.proposals.status,
        offerDetails: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
        createdAt: schema.proposals.createdAt,
        hiredAt: schema.proposals.hiredAt,
      })
      .from(schema.proposals)
      .where(realEmployerId(schema.proposals.employerId)),
    db
      .select({
        internId: schema.interviews.internId,
        employerId: schema.interviews.employerId,
        status: schema.interviews.status,
        createdAt: schema.interviews.createdAt,
      })
      .from(schema.interviews)
      .where(realEmployerId(schema.interviews.employerId)),
    db
      .select({
        employerId: schema.employerPayments.employerId,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        status: schema.employerPayments.status,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
        raw: schema.employerPayments.raw,
      })
      .from(schema.employerPayments)
      .where(inArray(schema.employerPayments.status, SETTLED_STATUSES)),
    db
      .select({
        internId: schema.internPayments.internId,
        gateway: schema.internPayments.gateway,
        amountMinor: schema.internPayments.amountMinor,
        currency: schema.internPayments.currency,
        status: schema.internPayments.status,
        paidAt: schema.internPayments.paidAt,
        createdAt: schema.internPayments.createdAt,
      })
      .from(schema.internPayments)
      .where(inArray(schema.internPayments.status, ["paid"])),
    db
      .select({
        amountMinor: schema.collegeSeatBatches.amountMinor,
        status: schema.collegeSeatBatches.status,
        paidAt: schema.collegeSeatBatches.paidAt,
        createdAt: schema.collegeSeatBatches.createdAt,
      })
      .from(schema.collegeSeatBatches)
      .where(eq(schema.collegeSeatBatches.status, "paid")),
    // Interns by city (legacy's Geographic Distribution): grouped and limited in SQL, spelling and case folded.
    db
      .select({ city: sql<string>`min(trim(${schema.internOnboarding.city}))`, c: count() })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(and(eq(schema.users.role, "intern"), hasCity))
      .groupBy(sql`lower(trim(${schema.internOnboarding.city}))`)
      .orderBy(sql`count(*) desc`, sql`min(trim(${schema.internOnboarding.city}))`)
      .limit(6),
    db
      .select({ c: count() })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(and(eq(schema.users.role, "intern"), hasCity)),
  ]);

  // Paid either way legacy records it: a paid intern_payments row or the flag.
  const paidInterns = new Set(internPayments.map((p) => p.internId));
  const input: AnalyticsInput = {
    ...range,
    interns,
    onboarding: onboarding.map((o) => {
      const extra = (o.extraData ?? {}) as Record<string, unknown>;
      const score = Number(extra.findternScore);
      return {
        userId: o.userId,
        createdAt: o.createdAt,
        meaningful: Boolean(o.meaningful),
        feePaid: legacyFeeFlag(o.extraData) || paidInterns.has(o.userId),
        score: Number.isFinite(score) ? score : null,
      };
    }),
    employers,
    projects,
    proposals,
    interviews,
    employerPayments,
    // A college-drive waiver marks the fee covered (paidInterns above) but is not money received.
    internPayments: internPayments.filter(isMoneyReceived),
    collegeBatches,
    cities: cityRows.map((r) => ({ city: r.city, count: Number(r.c) })),
    citiesTotal: Number(cityTotal?.c ?? 0),
  };
  return computeAnalytics(input);
}
