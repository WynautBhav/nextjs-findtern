import { lineCharge } from "../checkout.ts";
import { parseOffer } from "../offer.ts";
import { toInrMinor } from "./money.ts";
import { addMonthsIso } from "./stipend-dues.ts";

/**
 * One company's money, per hire and per payment (ADP-20; legacy
 * admin-company-detail.tsx payments + "Upcoming payments" tabs).
 *
 * Per hire (accepted, processing or hired proposal):
 *  - not paid yet: the whole upfront charge is due, by the start date;
 *  - paid in full (an upfront / "total" order): nothing due, and the total is
 *    what was actually paid (a promo makes it less than the list price;
 *    legacy did the same);
 *  - monthly plan: months paid from the monthly orders, the remaining
 *    instalments (no hiring fee after the first) are due, next one on
 *    start + months paid;
 *  - hired with no order on record (free activation, legacy data): settled.
 *
 * Money is in the offer's currency per row; company totals are INR (USD at
 * the business rate), like every other admin total.
 */

type ProposalLike = {
  id: string;
  internId: string;
  projectId: string | null;
  status: string;
  offerDetails: unknown;
  currency: string | null;
};
type PaymentLike = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: Date | string | null;
  createdAt: Date | string | null;
  raw: unknown;
};

export type HireLedger = {
  proposalId: string;
  internId: string;
  projectId: string | null;
  status: string;
  currency: "INR" | "USD";
  fullTime: boolean;
  /** Annual CTC for full-time offers (minor units), else null. */
  ctcMinor: number | null;
  monthlyMinor: number | null;
  plan: "upfront" | "monthly" | "unpaid";
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  months: number;
  monthsPaid: number;
  monthsLeft: number;
  nextDueDate: string | null;
};

export type PaymentLedger = {
  paymentId: string;
  proposalIds: string[];
  /** "Full-time", "Internship" or "Mixed"; null when the order names no proposal. */
  type: "Full-time" | "Internship" | "Mixed" | null;
  mode: "Monthly" | "Upfront";
};

export type CompanyLedger = {
  hires: HireLedger[];
  payments: Map<string, PaymentLedger>;
  totals: { billedInrMinor: number; paidInrMinor: number; remainingInrMinor: number };
};

function notesOf(raw: unknown): { ids: string[]; dueIds: string[]; mode: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const order = (r.order && typeof r.order === "object" ? r.order : {}) as Record<string, unknown>;
  const n = (r.notes ?? order.notes ?? {}) as Record<string, unknown>;
  let ids: unknown = n.proposalIds ?? n.proposal_ids ?? r.proposalIds ?? r.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return { ids: list(ids), dueIds: list(n.dueProposalIds), mode: String(n.paymentMode ?? "total").toLowerCase() };
}

const time = (d: Date | string | null | undefined) => {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function companyLedger(
  proposals: ProposalLike[],
  payments: PaymentLike[],
  scoreOf: (internId: string) => number,
): CompanyLedger {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const offers = new Map(proposals.map((p) => [p.id, parseOffer(p.offerDetails, p.currency)]));

  const paidMinor = new Map<string, number>();
  const monthlyCount = new Map<string, number>();
  const paidInFull = new Set<string>();
  const paymentInfo = new Map<string, PaymentLedger>();

  // Oldest first, so "first monthly payment" (which carries the fee) is right.
  const paid = payments.filter((p) => p.status === "paid").sort((a, b) => time(a.paidAt ?? a.createdAt) - time(b.paidAt ?? b.createdAt));

  for (const pay of payments) {
    const { ids, mode } = notesOf(pay.raw);
    const kinds = new Set(ids.map((id) => (offers.get(id)?.fullTime ? "Full-time" : byId.has(id) ? "Internship" : null)).filter(Boolean));
    paymentInfo.set(pay.id, {
      paymentId: pay.id,
      proposalIds: ids,
      type: kinds.size === 0 ? null : kinds.size > 1 ? "Mixed" : (kinds.values().next().value as "Full-time" | "Internship"),
      mode: mode === "monthly" ? "Monthly" : "Upfront",
    });
  }

  for (const pay of paid) {
    const { ids, dueIds, mode } = notesOf(pay.raw);
    const mine = ids.filter((id) => byId.has(id));
    if (mine.length === 0) continue;
    const monthly = mode === "monthly";
    // What each line should have cost in this order, to split the amount.
    const weights = mine.map((id) => {
      const offer = offers.get(id)!;
      const score = scoreOf(byId.get(id)!.internId);
      const isMonthly = monthly || dueIds.includes(id);
      const first = (monthlyCount.get(id) ?? 0) === 0;
      return Math.max(1, lineCharge(offer, score, isMonthly ? "monthly" : "upfront", { firstPayment: first }).totalMinor);
    });
    const sum = weights.reduce((s, w) => s + w, 0);
    let left = Math.max(0, pay.amountMinor);
    mine.forEach((id, i) => {
      const share = i === mine.length - 1 ? left : Math.round((Math.max(0, pay.amountMinor) * weights[i]) / sum);
      left -= share;
      paidMinor.set(id, (paidMinor.get(id) ?? 0) + share);
      if (monthly || dueIds.includes(id)) monthlyCount.set(id, (monthlyCount.get(id) ?? 0) + 1);
      else paidInFull.add(id);
    });
  }

  const hires: HireLedger[] = [];
  for (const p of proposals) {
    if (!["accepted", "processing", "hired"].includes(p.status)) continue;
    const offer = offers.get(p.id)!;
    const score = scoreOf(p.internId);
    const base = {
      proposalId: p.id,
      internId: p.internId,
      projectId: p.projectId,
      status: p.status,
      currency: offer.currency,
      fullTime: Boolean(offer.fullTime),
      ctcMinor: offer.fullTime?.annualCtcMinor ?? null,
      monthlyMinor: offer.fullTime ? null : offer.monthlyMinor,
      months: offer.fullTime ? 1 : offer.months,
    };
    const paidSoFar = paidMinor.get(p.id) ?? 0;
    const monthsPaid = monthlyCount.get(p.id) ?? 0;

    if (paidInFull.has(p.id) || (p.status === "hired" && monthsPaid === 0)) {
      hires.push({ ...base, plan: "upfront", totalMinor: paidSoFar, paidMinor: paidSoFar, dueMinor: 0, monthsPaid: base.months, monthsLeft: 0, nextDueDate: null });
    } else if (monthsPaid > 0) {
      const left = Math.max(0, base.months - monthsPaid);
      const instalment = lineCharge(offer, score, "monthly", { firstPayment: false }).totalMinor;
      const due = instalment * left;
      hires.push({
        ...base,
        plan: "monthly",
        totalMinor: paidSoFar + due,
        paidMinor: paidSoFar,
        dueMinor: due,
        monthsPaid: Math.min(monthsPaid, base.months),
        monthsLeft: left,
        nextDueDate: left > 0 ? addMonthsIso(offer.startDate, monthsPaid) : null,
      });
    } else {
      const due = lineCharge(offer, score, "upfront").totalMinor;
      hires.push({ ...base, plan: "unpaid", totalMinor: due, paidMinor: 0, dueMinor: due, monthsPaid: 0, monthsLeft: base.months, nextDueDate: offer.startDate });
    }
  }

  const paidInr = paid.reduce((s, p) => s + toInrMinor(p.amountMinor, p.currency), 0);
  const remainingInr = hires.reduce((s, h) => s + toInrMinor(h.dueMinor, h.currency), 0);
  return {
    hires,
    payments: paymentInfo,
    totals: { billedInrMinor: paidInr + remainingInr, paidInrMinor: paidInr, remainingInrMinor: remainingInr },
  };
}
