import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { computeAnalytics, type AnalyticsInput } from "@/lib/admin/analytics";
import { periodStart } from "@/lib/admin/params";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";

/** Range from `?from=&to=` (dates, inclusive), `?period=30d`, or `?period=all`; default the last 18 months (legacy). */
export function analyticsRange(params: Record<string, string | undefined>): { since: Date | null; until: Date | null } {
  const valid = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  const from = valid(params.from);
  const to = valid(params.to);
  if (from || to) return { since: from, until: to ? new Date(to.getTime() + 86_400_000) : null };
  const preset = periodStart(params.period);
  if (preset) return { since: preset, until: null };
  if (params.period === "all") return { since: null, until: null };
  // Legacy default: the last 18 months.
  const d = new Date();
  return { since: new Date(d.getFullYear(), d.getMonth() - 17, 1), until: null };
}

/**
 * Everything the analytics need, test employers excluded, in one pass. Sized
 * for this platform's volumes (hundreds to low thousands of rows); if that
 * changes, move the counting into SQL rather than paging this.
 */
export async function loadAnalytics(range: { since: Date | null; until: Date | null }) {
  const db = getDb();
  const [interns, onboarding, employers, projects, proposals, interviews, employerPayments, internPayments] = await Promise.all([
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
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        status: schema.employerPayments.status,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
      })
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.status, "paid")),
    db
      .select({
        internId: schema.internPayments.internId,
        amountMinor: schema.internPayments.amountMinor,
        currency: schema.internPayments.currency,
        status: schema.internPayments.status,
        paidAt: schema.internPayments.paidAt,
        createdAt: schema.internPayments.createdAt,
      })
      .from(schema.internPayments)
      .where(inArray(schema.internPayments.status, ["paid"])),
  ]);

  // Paid either way legacy records it: a paid intern_payments row or the flag.
  const paidInterns = new Set(internPayments.map((p) => p.internId));
  const input: AnalyticsInput = {
    ...range,
    interns,
    onboarding: onboarding.map((o) => {
      const extra = (o.extraData ?? {}) as Record<string, unknown>;
      const payment = (extra.payment ?? {}) as Record<string, unknown>;
      const score = Number(extra.findternScore);
      return {
        userId: o.userId,
        createdAt: o.createdAt,
        meaningful: Boolean(o.meaningful),
        feePaid: payment.isPaid === true || paidInterns.has(o.userId),
        score: Number.isFinite(score) ? score : null,
      };
    }),
    employers,
    projects,
    proposals,
    interviews,
    employerPayments,
    internPayments,
  };
  return computeAnalytics(input);
}
