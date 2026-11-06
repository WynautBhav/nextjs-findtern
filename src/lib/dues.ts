import { billingPlanOf, engagementEndOn, istDay, orderNotes, postpaidAnchor, postpaidDueOn, postpaidMonthsPaid, postpaidNext } from "./billing-plan.ts";
import { acceptedLineCharge } from "./accepted-charge.ts";
import { monthsOf, parseOffer } from "./offer.ts";

/**
 * Monthly-plan placements: how many months each hired proposal has paid for,
 * read from paid employer orders (`raw.notes.paymentMode === "monthly"`).
 * A proposal with at least one monthly payment and fewer than its duration
 * owes the next month.
 */

type PaymentLike = { status: string; raw: unknown; paidAt?: Date | string | null };
type ProposalLike = { id: string; status: string; offerDetails: unknown; hiredAt?: Date | string | null };

const notesOf = orderNotes;

/** The promo discount an order recorded, in minor units (0 when none). */
function promoDiscountOf(raw: unknown): number {
  const n = Number(((raw ?? {}) as { promo?: { discountMinor?: unknown } }).promo?.discountMinor);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The Orders button: "1 payment due · 1 can be paid early"; a part that is zero is left out. */
export function paymentsBadge(due: number, early: number): string {
  return [due > 0 ? `${due} ${due === 1 ? "payment" : "payments"} due` : "", early > 0 ? `${early} can be paid early` : ""].filter(Boolean).join(" · ");
}

export type Due = {
  proposalId: string;
  monthsPaid: number;
  months: number;
  plan: "monthly_prepaid" | "postpaid";
  /** Post-paid: month `monthsPaid + 1` falls due on this day (YYYY-MM-DD); null for pay-at-start hires. */
  dueOn: string | null;
  /** Can this month be paid now? Pay-at-start months always; post-paid ones from 15 days before their due day. */
  payable: boolean;
};

/**
 * Hired placements with months still to pay. Pay-at-start hires (grandfathered)
 * owe the next month straight away; post-paid hires owe month k 2 days before
 * the intern is paid for it, payable from 15 days before that (`todayIst`, YYYY-MM-DD).
 */
export function monthlyDues(proposals: ProposalLike[], payments: PaymentLike[], todayIst: string = istDay(new Date())!): Due[] {
  const paid = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const { ids, mode, dueIds } = notesOf(p.raw);
    // A monthly order pays one month of each line; an upfront order can still
    // carry next-month dues for monthly placements (dueProposalIds).
    for (const id of mode === "monthly" ? ids : dueIds) paid.set(id, (paid.get(id) ?? 0) + 1);
  }
  const dues: Due[] = [];
  for (const p of proposals) {
    if (p.status !== "hired") continue;
    const plan = billingPlanOf(p.id, payments);
    const offer = (p.offerDetails ?? {}) as Record<string, unknown>;
    const months = monthsOf(offer.duration);
    if (plan === "postpaid") {
      const monthsPaid = postpaidMonthsPaid(p.id, payments);
      if (monthsPaid >= months) continue;
      const next = postpaidNext(postpaidAnchor(offer.startDate as string | undefined, p.hiredAt), months, monthsPaid, todayIst);
      dues.push({ proposalId: p.id, monthsPaid, months, plan, dueOn: next?.dueOn ?? null, payable: Boolean(next?.payable) });
    } else if (paid.has(p.id) && paid.get(p.id)! < months) {
      dues.push({ proposalId: p.id, monthsPaid: paid.get(p.id)!, months, plan: "monthly_prepaid", dueOn: null, payable: true });
    }
  }
  return dues;
}

/* ── Placement ledger (EMH-11) ──────────────────────────────────────────
 * Legacy's "Upcoming payments" listed every hire with its total, what was
 * paid, what is left, the dates paid and the next date due. Worked out from
 * the offer (what the hire costs) and the paid orders (which months they
 * covered); old multi-hire orders can't be split per hire by amount, so the
 * offer is the source of the figures. */

type PaidOrderLike = PaymentLike & { paidAt?: Date | string | null };
type HireLike = ProposalLike & { currency?: string | null };

export type PlacementLedger = {
  proposalId: string;
  plan: "upfront" | "monthly" | "postpaid" | "full_time" | "unpaid";
  currency: "INR" | "USD";
  /** Whole engagement incl. the one-time hiring fee (or the full-time fee). Minor units. */
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  months: number;
  monthsPaid: number;
  /** ISO times of the payments that covered this hire, oldest first. */
  paidOn: string[];
  /** YYYY-MM-DD the next month falls due (start + months paid); null when nothing is left. */
  nextDue: string | null;
  /** YYYY-MM-DD the engagement ends (start + months); null without a start date or for full time. */
  endsOn: string | null;
  status: "fully_paid" | "partially_paid" | "unpaid";
};

function addMonths(isoDay: string | null, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(Number(m[3]), last))).toISOString().slice(0, 10);
}

export function placementLedger(hire: HireLike, payments: readonly PaidOrderLike[]): PlacementLedger {
  const offer = parseOffer(hire.offerDetails, hire.currency);
  const upfront = acceptedLineCharge(offer, "upfront");
  const monthly = acceptedLineCharge(offer, "monthly", { firstPayment: false });
  let upfrontPaid = false;
  let monthsPaid = 0;
  // What promo codes took off this hire. An order stores it (`raw.promo`), and
  // only a one-hire order can be pinned to its hire; older multi-hire orders
  // keep the offer's figures (see above).
  let promoMinor = 0;
  const paidOn: string[] = [];
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const { ids, mode, dueIds, firstMonthIds } = notesOf(p.raw);
    const asDue = dueIds.includes(hire.id);
    if (!ids.includes(hire.id) && !asDue) continue;
    if (mode === "hiring_fee") {
      // The fee order is not "paid in full"; it covers Month 1 only when its notes say so (orders from before that rule do not).
      if (firstMonthIds.includes(hire.id)) monthsPaid += 1;
    } else if (mode === "monthly" || asDue) monthsPaid += 1;
    else upfrontPaid = true;
    if (ids.length <= 1) promoMinor += promoDiscountOf(p.raw);
    const at = p.paidAt ? new Date(p.paidAt) : null;
    if (at && !Number.isNaN(at.getTime())) paidOn.push(at.toISOString());
  }
  paidOn.sort();
  const months = offer.fullTime ? 1 : offer.months;
  // A code lowers the cost and the amount paid by the same figure, so what is
  // still due does not change and "paid" is what was actually charged.
  const listMinor = upfront.totalMinor;
  const totalMinor = Math.max(0, listMinor - promoMinor);
  const postpaid = !offer.fullTime && billingPlanOf(hire.id, payments) === "postpaid";
  const plan: PlacementLedger["plan"] = offer.fullTime
    ? "full_time"
    : postpaid
      ? "postpaid"
      : upfrontPaid
      ? "upfront"
      : monthsPaid > 0
        ? "monthly"
        : "unpaid";
  const paidMinor =
    plan === "upfront" || (plan === "full_time" && paidOn.length > 0)
      ? totalMinor
      : plan === "monthly" || plan === "postpaid"
        ? Math.max(0, Math.min(listMinor, upfront.perHireMinor + monthly.totalMinor * monthsPaid) - promoMinor)
        : 0;
  const dueMinor = Math.max(0, totalMinor - paidMinor);
  const covered = plan === "upfront" || (plan === "full_time" && paidMinor > 0) ? months : Math.min(monthsPaid, months);
  return {
    proposalId: hire.id,
    plan,
    currency: offer.currency,
    totalMinor,
    paidMinor,
    dueMinor,
    months,
    monthsPaid: covered,
    paidOn,
    nextDue:
      dueMinor > 0 && covered < months
        ? plan === "postpaid"
          ? postpaidDueOn(postpaidAnchor(offer.startDate, hire.hiredAt), months, covered + 1)
          : addMonths(offer.startDate, covered)
        : null,
    // The last period's end (as the instalments and timesheets count it), not start + months, which is a day later.
    endsOn: offer.fullTime ? null : (engagementEndOn(offer.startDate, offer.months) ?? addMonths(offer.startDate, offer.months)),
    status: dueMinor === 0 && paidMinor > 0 ? "fully_paid" : paidMinor > 0 ? "partially_paid" : "unpaid",
  };
}

/** True when any line being paid is not the month the client asked for (already paid, or a later one is due). */
export function paymentIndexMismatch(lines: { due: { monthsPaid: number } | null }[], paymentIndex: number): boolean {
  return lines.some((l) => (l.due?.monthsPaid ?? 0) !== paymentIndex);
}
