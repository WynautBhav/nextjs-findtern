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

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { acceptedLineCharge } from "@/lib/accepted-charge";
import { hireFeeMinor, lineCharge, type LineCharge, type PayMode } from "@/lib/checkout";
import { feeDisplay, type FeeDisplay } from "@/lib/fee-display";
import { getDb, schema } from "@/lib/db";
import { istDay, postpaidAnchor, postpaidDueOn } from "@/lib/billing-plan";
import { monthlyDues } from "@/lib/dues";
import { parseOffer } from "@/lib/offer";
import { initialsOf, scoreOf } from "@/lib/employer-candidates";
import { hiredInternIds, hiredProposalSql, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, type Currency } from "@/lib/employer-pricing";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { splitTakenDownProposals, TAKEN_DOWN_PAY_NOTE } from "@/lib/projects/takedown-payable";


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
  /** How the one-time hiring fee is shown at checkout (lib/fee-display.ts). */
  fee: FeeDisplay;
  /** Same line billed as one month (score 6+ only; see charge.monthlyBlocked). */
  monthlyCharge: LineCharge;
  /** Set for a hired monthly-plan placement: the next month is due. */
  due: { monthsPaid: number; months: number } | null;
  /** YYYY-MM-DD the due month falls due (post-paid: 2 days before the intern's pay day; else start + months paid); null when not a due line or no start. */
  dueOn: string | null;
  /** The first payment of a post-paid hire (score 6+ internship): hiring fee + Month 1 charge, whatever mode was asked for. */
  feeCharge: LineCharge;
  /** YYYY-MM-DD each month after the first falls due on a post-paid hire, month 2 first (month 1 is paid with the hiring charge); empty when not offered, one month long, or no start date. */
  schedule: string[];
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

/** An accepted offer or due month the employer cannot pay now because its project is taken down (shown, never orderable). */
export type BlockedPayable = { id: string; projectId: string; projectName: string | null; internInitials: string; note: string };

export type PayableCheckout = {
  lines: PayableLine[];
  /**
   * Offers / due months that would be payable but belong to a project Findtern took down. They are NOT in `lines`
   * (so not in `totals`, the "To pay" counts or any pay-now button) and carry the note "Taken down: contact admin".
   * Empty whenever no project is taken down.
   */
  blocked: BlockedPayable[];
  /** Per-currency order total, minor units. */
  totals: Map<Currency, number>;
  region: "IN" | null;
  defaultCurrency: Currency;
  prefill: { name?: string; email?: string; contact?: string };
};

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Accepted offers awaiting payment, plus hired monthly-plan placements whose
 * next month is due. `processing` is the legacy status for an accepted offer
 * mid-payment; without it those rows could never be paid. The order route
 * reruns this on its locking transaction to confirm what it priced is still
 * payable.
 */
export async function openProposalsWithDues(db: Db | Tx, employerId: string) {
  const open = await db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.status, ["accepted", "processing", "hired"])))
    .orderBy(desc(schema.proposals.updatedAt));
  const payments = await db
    .select({ status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt })
    .from(schema.employerPayments)
    .where(eq(schema.employerPayments.employerId, employerId));
  const all = monthlyDues(open, payments);
  // `dues` is what can be paid now; `upcoming` is post-paid months not yet due (display only, never orderable).
  return {
    open,
    dues: new Map(all.filter((d) => d.payable).map((d) => [d.proposalId, d])),
    upcoming: new Map(all.filter((d) => !d.payable).map((d) => [d.proposalId, d])),
  };
}

export async function payableCheckout(
  employerId: string,
  opts: { proposalIds?: string[]; mode?: PayMode } = {},
): Promise<PayableCheckout> {
  const db = getDb();
  // The hiring fee is decided here, at charge time, from the live setting and each offer's band, so the page and the order route agree.
  const feeSetting = await getPerHireFeeSetting();

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


  const { open, dues } = await openProposalsWithDues(db, employerId);
  const wanted = open.filter(
    (p) =>
      (p.status === "accepted" || p.status === "processing" || dues.has(p.id)) && (!opts.proposalIds?.length || opts.proposalIds.includes(p.id)),
  );
  // A project Findtern took down is view-only for the employer: its offers and due months are listed as blocked, never as payable.
  const wantedProjectIds = [...new Set(wanted.map((p) => p.projectId))];
  const downRows = wantedProjectIds.length
    ? await db
        .select({ id: schema.projects.id, projectName: schema.projects.projectName })
        .from(schema.projects)
        .where(and(inArray(schema.projects.id, wantedProjectIds), isNotNull(schema.projects.takenDownAt)))
    : [];
  const { payable: proposals, blocked: blockedProposals } = splitTakenDownProposals(wanted, new Set(downRows.map((r) => r.id)));
  const downName = new Map(downRows.map((r) => [r.id, r.projectName]));
  const blocked: BlockedPayable[] = blockedProposals.map((p) => ({ id: p.id, projectId: p.projectId, projectName: downName.get(p.projectId) ?? null, note: TAKEN_DOWN_PAY_NOTE }));

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
      const isDue = dues.has(proposal.id);
      // A due month is a later instalment: the hiring fee was in the first.
      const charge = isDue
        ? acceptedLineCharge(offer, "monthly", { firstPayment: false })
        : lineCharge(offer, score, opts.mode, { feeSetting, bandScore: score });
      const feeCharge = acceptedLineCharge(offer, "postpaid", { feeSetting, bandScore: score });
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
        charge,
        // How the one-time fee is shown: FREE only when every charge path above bills 0 for it.
        fee: feeDisplay({
          currency: offer.currency,
          chargedMinor: Math.max(charge.perHireMinor, feeCharge.perHireMinor),
          listMinor: hireFeeMinor(offer),
          applicable: !offer.fullTime && !isDue,
        }),
        // What one month costs here: no hiring fee on a later instalment, or
        // the summary shows more than the order route charges.
        // A due month is priced on the fixed basis; a not-yet-due line keeps the live score
        // only so the checkout can say why month-end payment is not offered (monthlyBlocked).
        monthlyCharge: dues.has(proposal.id)
          ? acceptedLineCharge(offer, "monthly", { firstPayment: false })
          : lineCharge(offer, score, "monthly", { feeSetting, bandScore: score }),
        due: dues.get(proposal.id) ?? null,
        dueOn: dues.has(proposal.id) ? (dues.get(proposal.id)!.dueOn ?? addMonthsDay(offer.startDate, dues.get(proposal.id)!.monthsPaid)) : null,
        feeCharge,
        schedule: dues.has(proposal.id) || offer.fullTime
          ? []
          : Array.from({ length: Math.max(0, offer.months - 1) }, (_, i) => postpaidDueOn(postpaidAnchor(offer.startDate, null) ?? istDay(new Date()), offer.months, i + 2) ?? "").filter(Boolean),
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

  return { lines, blocked, totals, region, defaultCurrency, prefill };
}
