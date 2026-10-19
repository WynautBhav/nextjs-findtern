import { lineCharge } from "../checkout.ts";
import { monthlyDues } from "../dues.ts";
import { parseOffer } from "../offer.ts";
import { toInrMinor } from "./money.ts";
import { addMonthsIso, stipendDues } from "./stipend-dues.ts";

/**
 * Money in / money out (legacy `GET /api/admin/reports/transactions`,
 * routes.ts:5100-5453).
 *
 * Receivables - money coming to Findtern:
 *  - company: paid orders (received), accepted/processing offers not yet paid
 *    (their upfront charge, due by the start date), and remaining monthly
 *    instalments of monthly-plan hires (start + month n);
 *  - candidate: paid activation fees, and profiles whose fee is still unpaid
 *    (legacy listed these too; they are prospects, not debts, and are marked so).
 * Payables - money Findtern owes interns: recorded payouts (paid / pending)
 * and stipend months not yet queued.
 *
 * Legacy summed each currency raw; rows keep their own currency and every
 * total is also given in INR.
 */

export type MoneyRow = {
  id: string;
  date: string;
  source: "company" | "candidate";
  status: "received" | "due" | "upcoming" | "unpaid" | "paid" | "pending";
  description: string;
  companyName: string | null;
  candidateName: string | null;
  amountMinor: number;
  currency: string;
  inrMinor: number;
  reference: string | null;
};

export type ReceivablesInput = {
  since: Date | null;
  until: Date | null;
  employerName: (id: string) => string;
  internName: (id: string) => string;
  scoreOf: (internId: string) => number;
  activationFeeMinor: number;
  proposals: { id: string; employerId: string; internId: string; status: string; offerDetails: unknown; currency: string | null }[];
  employerPayments: { id: string; employerId: string; orderId: string; paymentId: string | null; status: string; amountMinor: number; currency: string; paidAt: Date | null; createdAt: Date | null; raw: unknown }[];
  internPayments: { id: string; internId: string; paymentId: string | null; status: string; amountMinor: number; currency: string; paidAt: Date | null; createdAt: Date | null }[];
  unpaidProfiles: { userId: string; createdAt: Date | null }[];
  payouts: { id: string; internId: string; status: string; amountMinor: number; currency: string; referenceId: string | null; paidAt: Date | null; createdAt: Date | null; raw: unknown }[];
};

const day = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

export function computeReceivables(input: ReceivablesInput, filter: { receivables: "both" | "company" | "candidate"; payables: "both" | "company" | "candidate" }) {
  const lo = input.since ? input.since.toISOString().slice(0, 10) : null;
  const hi = input.until ? new Date(input.until.getTime() - 1).toISOString().slice(0, 10) : null;
  const inRange = (date: string | null) => date != null && (!lo || date >= lo) && (!hi || date <= hi);

  const receivables: MoneyRow[] = [];
  const payables: MoneyRow[] = [];
  const row = (r: Omit<MoneyRow, "inrMinor">): MoneyRow => ({ ...r, inrMinor: toInrMinor(r.amountMinor, r.currency) });

  if (filter.receivables !== "candidate") {
    for (const p of input.employerPayments) {
      if (p.status !== "paid") continue;
      const date = day(p.paidAt ?? p.createdAt);
      if (!inRange(date)) continue;
      receivables.push(
        row({
          id: `order:${p.id}`,
          date: date!,
          source: "company",
          status: "received",
          description: "Employer payment",
          companyName: input.employerName(p.employerId),
          candidateName: null,
          amountMinor: p.amountMinor,
          currency: p.currency,
          reference: p.paymentId ?? p.orderId,
        }),
      );
    }

    for (const p of input.proposals) {
      if (p.status !== "accepted" && p.status !== "processing") continue;
      const offer = parseOffer(p.offerDetails, p.currency);
      const date = offer.startDate ?? null;
      if (!inRange(date)) continue;
      receivables.push(
        row({
          id: `due:${p.id}`,
          date: date!,
          source: "company",
          status: "due",
          description: offer.fullTime ? "Full-time hiring fee (offer accepted, unpaid)" : "Offer accepted, awaiting payment",
          companyName: input.employerName(p.employerId),
          candidateName: input.internName(p.internId),
          amountMinor: lineCharge(offer, input.scoreOf(p.internId), "upfront").totalMinor,
          currency: offer.currency,
          reference: null,
        }),
      );
    }

    const paidOrders = input.employerPayments.filter((p) => p.status === "paid");
    for (const d of monthlyDues(input.proposals, paidOrders)) {
      const p = input.proposals.find((x) => x.id === d.proposalId);
      if (!p) continue;
      const offer = parseOffer(p.offerDetails, p.currency);
      const instalment = lineCharge(offer, input.scoreOf(p.internId), "monthly").totalMinor;
      for (let i = d.monthsPaid; i < d.months; i++) {
        const date = addMonthsIso(offer.startDate, i);
        if (!inRange(date)) continue;
        receivables.push(
          row({
            id: `instalment:${p.id}:${i + 1}`,
            date: date!,
            source: "company",
            status: "upcoming",
            description: `Monthly instalment ${i + 1} of ${d.months}`,
            companyName: input.employerName(p.employerId),
            candidateName: input.internName(p.internId),
            amountMinor: instalment,
            currency: offer.currency,
            reference: null,
          }),
        );
      }
    }
  }

  if (filter.receivables !== "company") {
    for (const p of input.internPayments) {
      if (p.status !== "paid") continue;
      const date = day(p.paidAt ?? p.createdAt);
      if (!inRange(date)) continue;
      receivables.push(
        row({
          id: `fee:${p.id}`,
          date: date!,
          source: "candidate",
          status: "received",
          description: "Activation fee",
          companyName: null,
          candidateName: input.internName(p.internId),
          amountMinor: p.amountMinor,
          currency: p.currency,
          reference: p.paymentId,
        }),
      );
    }
    for (const o of input.unpaidProfiles) {
      const date = day(o.createdAt);
      if (!inRange(date)) continue;
      receivables.push(
        row({
          id: `activation:${o.userId}`,
          date: date!,
          source: "candidate",
          status: "unpaid",
          description: "Profile created, activation fee not paid",
          companyName: null,
          candidateName: input.internName(o.userId),
          amountMinor: input.activationFeeMinor,
          currency: "INR",
          reference: null,
        }),
      );
    }
  }

  // Payables are all candidate-side (stipends); a "company" filter empties them.
  if (filter.payables !== "company") {
    for (const p of input.payouts) {
      const scheduled = (p.raw as Record<string, unknown> | null)?.scheduledFor;
      const date = day(p.paidAt ?? (typeof scheduled === "string" ? scheduled : null) ?? p.createdAt);
      if (!inRange(date)) continue;
      payables.push(
        row({
          id: `payout:${p.id}`,
          date: date!,
          source: "candidate",
          status: p.status === "paid" ? "paid" : "pending",
          description: "Stipend payout",
          companyName: null,
          candidateName: input.internName(p.internId),
          amountMinor: p.amountMinor,
          currency: p.currency,
          reference: p.referenceId,
        }),
      );
    }

    const byIntern = new Map<string, typeof input.proposals>();
    for (const p of input.proposals) byIntern.set(p.internId, [...(byIntern.get(p.internId) ?? []), p]);
    for (const [internId, props] of byIntern) {
      const mine = input.payouts.filter((p) => p.internId === internId);
      for (const d of stipendDues(props, mine, input.scoreOf(internId) || null)) {
        if (d.monthlyShareMinor <= 0) continue;
        // Months not yet recorded as a payout (a pending one covers the next).
        for (let i = d.paidMonths + (d.pending ? 1 : 0); i < d.months; i++) {
          const date = addMonthsIso(d.startDate, i + 1);
          if (!inRange(date)) continue;
          payables.push(
            row({
              id: `stipend:${d.proposalId}:${i + 1}`,
              date: date!,
              source: "candidate",
              status: "upcoming",
              description: `Stipend month ${i + 1} of ${d.months}`,
              companyName: input.employerName(d.employerId),
              candidateName: input.internName(internId),
              amountMinor: d.monthlyShareMinor,
              currency: "INR",
              reference: null,
            }),
          );
        }
      }
    }
  }

  const byDate = (a: MoneyRow, b: MoneyRow) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  receivables.sort(byDate);
  payables.sort(byDate);

  const total = (rows: MoneyRow[], statuses: MoneyRow["status"][]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.inrMinor, 0);

  return {
    receivables,
    payables,
    totals: {
      receivedMinor: total(receivables, ["received"]),
      dueMinor: total(receivables, ["due", "upcoming"]),
      prospectMinor: total(receivables, ["unpaid"]),
      paidOutMinor: total(payables, ["paid"]),
      owedMinor: total(payables, ["pending", "upcoming"]),
    },
  };
}

export type Receivables = ReturnType<typeof computeReceivables>;
