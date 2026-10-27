/**
 * Payable checkout computation, shared by the checkout page (to render) and
 * the Razorpay order route (to price). The route never trusts a posted
 * amount: if the client could name the total, an employer could pay less by
 * editing the request. Both sides call this one function so the number on
 * screen and the number charged cannot drift apart.
 *
 * The payable set is *accepted* proposals - a cart row is an intention, an
 * accepted proposal is a commitment, and only the second is worth billing.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { lineCharge, type LineCharge, type PayMode } from "@/lib/checkout";
import { getDb, schema } from "@/lib/db";
import { monthlyDues } from "@/lib/dues";
import { parseOffer } from "@/lib/offer";
import { initialsOf, scoreOf } from "@/lib/employer-candidates";
import { hiredInternIds, hiredProposalSql, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, type Currency } from "@/lib/employer-pricing";


export const DURATION_LABEL: Record<string, string> = {
  "1m": "1 month",
  "2m": "2 months",
  "3m": "3 months",
  "6m": "6 months",
};

export type PayableLine = {
  id: string;
  /** Full name - render through `displayNameOf`, never raw. */
  internName: string;
  internInitials: string;
  /** True only once the intern is hired; checkout is pre-payment, so usually false. */
  nameUnlocked: boolean;
  internId: string;
  projectName: string | null;
  roleTitle: string;
  durationLabel: string;
  months: number;
  /** Offer's monthly amount, minor units; null when the offer has none. */
  monthlyMinor: number | null;
  score: number;
  charge: LineCharge;
  /** Same line billed as one month (score 6+ only; see charge.monthlyBlocked). */
  monthlyCharge: LineCharge;
  /** Set for a hired monthly-plan placement: the next month is due. */
  due: { monthsPaid: number; months: number } | null;
  /** YYYY-MM-DD the due month falls due (start + months paid); null when not a due line or no start. */
  dueOn: string | null;
  /** Offer start date (YYYY-MM-DD) or null. */
  startDate: string | null;
  /** Set on a full-time offer: the annual CTC the 8.33% fee is on. */
  fullTimeCtcMinor: number | null;
  fullTime: boolean;
  currency: Currency;
};

function addMonthsDay(isoDay: string | null, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay ?? ""));
  if (!m) return null;
  const mo = Number(m[2]) - 1 + months;
  const last = new Date(Date.UTC(Number(m[1]), mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(Number(m[1]), mo, Math.min(Number(m[3]), last))).toISOString().slice(0, 10);
}

export type PayableCheckout = {
  lines: PayableLine[];
  /** Per-currency order total, minor units. */
  totals: Map<Currency, number>;
  region: "IN" | null;
  defaultCurrency: Currency;
  prefill: { name?: string; email?: string; contact?: string };
};

export async function payableCheckout(
  employerId: string,
  opts: { proposalIds?: string[]; mode?: PayMode } = {},
): Promise<PayableCheckout> {
  const db = getDb();

  const [employer] = await db
    .select({
      name: schema.employers.name,
      companyEmail: schema.employers.companyEmail,
      country: schema.employers.country,
      countryCode: schema.employers.countryCode,
      phoneNumber: schema.employers.phoneNumber,
    })
    .from(schema.employers)
    .where(eq(schema.employers.id, employerId))
    .limit(1);

  const region = employerRegion(employer ?? {});
  const defaultCurrency: Currency = region === "IN" ? "INR" : "USD";
  const prefill = {
    name: employer?.name,
    email: employer?.companyEmail,
    contact: employer ? `${employer.countryCode}${employer.phoneNumber}` : undefined,
  };


  // Accepted offers awaiting payment, plus hired monthly-plan placements
  // whose next month is due. `processing` is the legacy status for an accepted
  // offer mid-payment; without it those rows could never be paid.
  const [open, payments] = await Promise.all([
    db
      .select()
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.status, ["accepted", "processing", "hired"])))
      .orderBy(desc(schema.proposals.updatedAt)),
    db
      .select({ status: schema.employerPayments.status, raw: schema.employerPayments.raw })
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.employerId, employerId)),
  ]);
  const dues = new Map(monthlyDues(open, payments).map((d) => [d.proposalId, d]));
  const proposals = open.filter(
    (p) =>
      (p.status === "accepted" || p.status === "processing" || dues.has(p.id)) && (!opts.proposalIds?.length || opts.proposalIds.includes(p.id)),
  );

  let lines: PayableLine[] = [];

  if (proposals.length > 0) {
    const internIds = Array.from(new Set(proposals.map((p) => p.internId)));
    const projectIds = Array.from(new Set(proposals.map((p) => p.projectId)));

    const userRows = await db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(inArray(schema.users.id, internIds));
    const namesById = new Map(
      userRows.map((row) => {
        const first = (row.firstName || "").trim();
        const last = (row.lastName || "").trim();
        return [
          row.id,
          {
            full: `${first} ${last}`.trim() || "Intern",
            initials: initialsOf(first, last),
          },
        ] as const;
      }),
    );

    // Names unmask only on hire. Checkout lines are accepted (pre-payment),
    // so almost every line here renders initials.
    const hiredRows = await db
      .select({ internId: schema.proposals.internId })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), hiredProposalSql()));
    const hiredIds = (await isAdminViewing())
      ? await hiredInternIds(db, employerId)
      : new Set(hiredRows.map((row) => row.internId));

    const onboardingRows = await db
      .select()
      .from(schema.internOnboarding)
      .where(inArray(schema.internOnboarding.userId, internIds));
    const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));

    const projectRows = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(and(eq(schema.projects.employerId, employerId), inArray(schema.projects.id, projectIds)));
    const projectsById = new Map(projectRows.map((row) => [row.id, row.projectName]));

    lines = proposals.map((proposal) => {
      const offer = parseOffer(proposal.offerDetails, proposal.currency);
      const score = scoreOf(onboardingByUser.get(proposal.internId));
      return {
        id: proposal.id,
        internName: namesById.get(proposal.internId)?.full ?? "Intern",
        internInitials: namesById.get(proposal.internId)?.initials ?? "?",
        nameUnlocked: hiredIds.has(proposal.internId),
        internId: proposal.internId,
        projectName: projectsById.get(proposal.projectId) ?? null,
        roleTitle: offer.roleTitle || projectsById.get(proposal.projectId) || "Internship",
        // EMH-23: a full-time offer has no duration; it is a one-time fee.
        durationLabel: offer.fullTime
          ? "Full-time role"
          : dues.has(proposal.id)
            ? `Month ${dues.get(proposal.id)!.monthsPaid + 1} of ${offer.months}`
            : (DURATION_LABEL[offer.duration] ?? `${offer.months} month${offer.months === 1 ? "" : "s"}`),
        months: offer.months,
        monthlyMinor: offer.monthlyMinor,
        score,
        // A due month is a later instalment: the hiring fee was in the first.
        charge: dues.has(proposal.id)
          ? lineCharge(offer, score, "monthly", { firstPayment: false })
          : lineCharge(offer, score, opts.mode),
        // What one month costs here: no hiring fee on a later instalment, or
        // the summary shows more than the order route charges.
        monthlyCharge: lineCharge(offer, score, "monthly", { firstPayment: !dues.has(proposal.id) }),
        due: dues.get(proposal.id) ?? null,
        dueOn: dues.has(proposal.id) ? addMonthsDay(offer.startDate, dues.get(proposal.id)!.monthsPaid) : null,
        startDate: offer.startDate,
        fullTimeCtcMinor: offer.fullTime?.annualCtcMinor ?? null,
        fullTime: Boolean(offer.fullTime),
        currency: offer.currency,
      };
    });
  }

  const totals = new Map<Currency, number>();
  for (const line of lines) {
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.charge.totalMinor);
  }

  return { lines, totals, region, defaultCurrency, prefill };
}
