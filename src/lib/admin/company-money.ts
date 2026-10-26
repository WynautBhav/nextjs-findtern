import { lineCharge } from "../checkout.ts";
import { monthlyDues } from "../dues.ts";
import { parseOffer } from "../offer.ts";
import { toInrMinor } from "./money.ts";
import { addMonthsIso } from "./stipend-dues.ts";

/**
 * Per-company money columns for the admin companies list (legacy showed last
 * payment, upcoming payment and amount left, routes.ts:9898-10324).
 *
 * Built from what is actually owed, not legacy's "billed minus paid", whose
 * "billed" counted checkouts that were opened and abandoned:
 *  - accepted/processing proposals not yet paid → their upfront charge, due by
 *    the start date;
 *  - monthly-plan hires with months left → the remaining instalments, next one
 *    due start + months paid.
 * Everything is in INR minor units (USD converted at the business rate).
 */

type ProposalLike = { id: string; employerId: string | null; internId: string; status: string; offerDetails: unknown; currency: string | null };
type PaymentLike = { employerId: string; status: string; amountMinor: number; currency: string; paidAt: Date | string | null; createdAt: Date | string | null; raw: unknown };

export type CompanyMoney = {
  lastPaymentAt: string | null;
  lastPaymentInrMinor: number | null;
  nextDueDate: string | null;
  amountLeftInrMinor: number;
};

const iso = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

export function companyMoney(
  employerIds: string[],
  proposals: ProposalLike[],
  payments: PaymentLike[],
  scoreOf: (internId: string) => number,
): Map<string, CompanyMoney> {
  const out = new Map<string, CompanyMoney>();
  for (const employerId of employerIds) {
    const mine = proposals.filter((p) => p.employerId === employerId);
    const paid = payments.filter((p) => p.employerId === employerId && p.status === "paid");

    let last: PaymentLike | null = null;
    for (const p of paid) {
      const at = iso(p.paidAt ?? p.createdAt);
      if (at && (!last || at > (iso(last.paidAt ?? last.createdAt) ?? ""))) last = p;
    }

    let amountLeft = 0;
    const dueDates: string[] = [];

    for (const p of mine.filter((x) => x.status === "accepted" || x.status === "processing")) {
      const offer = parseOffer(p.offerDetails, p.currency);
      amountLeft += toInrMinor(lineCharge(offer, scoreOf(p.internId), "upfront").totalMinor, offer.currency);
      if (offer.startDate) dueDates.push(offer.startDate);
    }

    for (const d of monthlyDues(mine, paid)) {
      const p = mine.find((x) => x.id === d.proposalId);
      if (!p) continue;
      const offer = parseOffer(p.offerDetails, p.currency);
      const instalment = lineCharge(offer, scoreOf(p.internId), "monthly", { firstPayment: false }).totalMinor;
      amountLeft += toInrMinor(instalment * (d.months - d.monthsPaid), offer.currency);
      const next = addMonthsIso(offer.startDate, d.monthsPaid);
      if (next) dueDates.push(next);
    }

    dueDates.sort();
    out.set(employerId, {
      lastPaymentAt: last ? iso(last.paidAt ?? last.createdAt) : null,
      lastPaymentInrMinor: last ? toInrMinor(last.amountMinor, last.currency) : null,
      nextDueDate: dueDates[0] ?? null,
      amountLeftInrMinor: amountLeft,
    });
  }
  return out;
}
