import { orderNotes, postpaidAnchor, postpaidDueOn } from "../billing-plan.ts";
import { acceptedLineCharge } from "../accepted-charge.ts";
import { monthlyDues } from "../dues.ts";
import { parseOffer } from "../offer.ts";
import type { PerHireFeeSetting } from "../per-hire-fee.ts";
import { toInrMinor } from "./money.ts";
import { isSettledStatus, orderRefunds, refundGstMinor, settledOrders } from "../refund-accounting.ts";
import { WAIVER_GATEWAY, waiverFlagOf } from "../full-waiver.ts";
import { collegeBatchReceipts, istDayKey, revenueMinorOf } from "./revenue.ts";
import { addMonthsIso, proposalOf, stipendDues } from "./stipend-dues.ts";

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
  /** "college": seat sales to a college (money in) and withdrawals paid to one (money out). */
  source: "company" | "candidate" | "college";
  status: "received" | "due" | "upcoming" | "unpaid" | "paid" | "pending";
  description: string;
  companyName: string | null;
  candidateName: string | null;
  amountMinor: number;
  currency: string;
  inrMinor: number;
  reference: string | null;
};

/**
 * A refund to a company: a contra record beside the payment it came out of, never a reopened receivable.
 * `gstInrMinor` is the GST inside the refunded amount (inclusive split, rounded like a payment); a refund with
 * GST and no credit note recorded needs one (CGST s.34).
 */
export type RefundRow = {
  id: string;
  orderId: string;
  date: string;
  companyName: string | null;
  description: string;
  amountMinor: number;
  currency: string;
  inrMinor: number;
  gstInrMinor: number;
  creditNote: string | null;
  creditNoteNeeded: boolean;
  /** No refund amount is recorded for the order; it is counted fully refunded from its status label alone. */
  amountNotRecorded: boolean;
  reference: string | null;
};

/** An order refunded while an intern payout for the same placement is already paid: an admin decides what to do. */
export type RefundFlag = {
  kind: "refund_after_payout";
  orderId: string;
  companyName: string | null;
  internNames: string[];
  refundedInrMinor: number;
  paidOutInrMinor: number;
  payoutIds: string[];
};

export type RefundTotals = { refundedMinor: number; gstMinor: number; netReceivedMinor: number };

export type ReceivablesInput = {
  since: Date | null;
  /** The clock, for overdue post-paid months; tests pass one. */
  now?: Date;
  until: Date | null;
  employerName: (id: string) => string;
  internName: (id: string) => string;
  scoreOf: (internId: string) => number;
  activationFeeMinor: number;
  proposals: { id: string; employerId: string; internId: string; status: string; offerDetails: unknown; currency: string | null; hiredAt?: Date | string | null }[];
  employerPayments: { id: string; employerId: string; orderId: string; gateway?: string; paymentId: string | null; status: string; amountMinor: number; currency: string; paidAt: Date | null; createdAt: Date | null; raw: unknown }[];
  internPayments: { id: string; internId: string; paymentId: string | null; status: string; amountMinor: number; currency: string; paidAt: Date | null; createdAt: Date | null }[];
  /** Orders a full-waiver code completed (both ledgers): reported as "Waived", never as money received. */
  waivedOrders?: { id: string; status: string; currency: string; at: Date | null; raw: unknown }[];
  unpaidProfiles: { userId: string; createdAt: Date | null }[];
  payouts: { id: string; internId: string; status: string; amountMinor: number; currency: string; referenceId: string | null; paidAt: Date | null; createdAt: Date | null; raw: unknown; kind?: string }[];
  /** College seat batches (any status; only paid ones are money received) and college withdrawals (only paid ones are money out). */
  collegeBatches?: { id: string; collegeId: string; status: string; amountMinor: number; invoiceNumber: string | null; referenceId: string | null; paidAt: Date | null; createdAt: Date | null; seats?: number }[];
  collegePayouts?: { id: string; collegeId: string; status: string; amountMinor: number; referenceId: string | null; paidAt: Date | null; createdAt: Date | null }[];
  collegeName?: (id: string) => string;
  /** The live hiring-fee setting, for offers accepted but not yet paid. */
  feeSetting?: PerHireFeeSetting;
};

const day = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

export function computeReceivables(input: ReceivablesInput, filter: { receivables: "both" | "company" | "candidate"; payables: "both" | "company" | "candidate" }) {
  // Date-only rows (offers, instalments, stipends) are bounded by India calendar days.
  const lo = input.since ? istDayKey(input.since) : null;
  const hi = input.until ? istDayKey(new Date(input.until.getTime() - 1)) : null;
  const inRange = (date: string | null) => date != null && (!lo || date >= lo) && (!hi || date <= hi);
  // Money received is bounded by the exact instant, as revenue.ts / loadCollected do. Comparing
  // calendar days let every payment made earlier on the boundary day into a "last 30 days" total.
  const receivedIn = (at: Date | null | undefined) => {
    if (!at) return false;
    const t = new Date(at).getTime();
    return !Number.isNaN(t) && (!input.since || t >= input.since.getTime()) && (!input.until || t < input.until.getTime());
  };

  const receivables: MoneyRow[] = [];
  const payables: MoneyRow[] = [];
  const refunds: RefundRow[] = [];
  const refundFlags: RefundFlag[] = [];
  const row = (r: Omit<MoneyRow, "inrMinor">): MoneyRow => ({ ...r, inrMinor: toInrMinor(r.amountMinor, r.currency) });

  /** The contra rows of one order, dated by the refund's own day, and the payout flag when an intern was already paid. */
  const refundRowsOf = (p: ReceivablesInput["employerPayments"][number]) => {
    const view = orderRefunds(p);
    if (view.refundedMinor <= 0) return;
    const entries = view.labelOnly ? [{ id: "label", amountMinor: view.refundedMinor, at: null as string | null, creditNote: null as string | null }] : view.refunds;
    let left = view.refundedMinor;
    let shown = 0;
    for (const e of entries) {
      const amountMinor = Math.min(e.amountMinor, left);
      left -= amountMinor;
      const when = e.at ? new Date(e.at) : (p.paidAt ?? p.createdAt);
      if (amountMinor <= 0 || !receivedIn(when)) continue;
      const gstInrMinor = toInrMinor(refundGstMinor(amountMinor, p.currency), p.currency);
      refunds.push({
        id: `refund:${p.id}:${e.id}`,
        orderId: p.id,
        date: istDayKey(when)!,
        companyName: input.employerName(p.employerId),
        description: view.labelOnly ? "Refund to employer (amount not recorded, whole order counted)" : "Refund to employer",
        amountMinor,
        currency: p.currency,
        inrMinor: toInrMinor(amountMinor, p.currency),
        gstInrMinor,
        creditNote: e.creditNote ?? null,
        creditNoteNeeded: gstInrMinor > 0 && !e.creditNote,
        amountNotRecorded: view.labelOnly,
        reference: p.paymentId ?? p.orderId,
      });
      shown += 1;
    }
    if (shown === 0) return;
    const hires = orderNotes(p.raw).ids.map((id) => input.proposals.find((x) => x.id === id)).filter((x): x is ReceivablesInput["proposals"][number] => Boolean(x));
    const paidOuts = input.payouts.filter((o) => String(o.status).toLowerCase() === "paid" && hires.some((h) => h.internId === o.internId && (proposalOf(o.raw) ?? h.id) === h.id));
    if (paidOuts.length === 0) return;
    refundFlags.push({
      kind: "refund_after_payout",
      orderId: p.id,
      companyName: input.employerName(p.employerId),
      internNames: [...new Set(paidOuts.map((o) => input.internName(o.internId)))],
      refundedInrMinor: toInrMinor(view.refundedMinor, p.currency),
      paidOutInrMinor: paidOuts.reduce((s, o) => s + toInrMinor(o.amountMinor, o.currency), 0),
      payoutIds: paidOuts.map((o) => o.id),
    });
  };

  if (filter.receivables !== "candidate") {
    for (const p of input.employerPayments) {
      if (!isSettledStatus(p.status)) continue;
      const date = istDayKey(p.paidAt ?? p.createdAt);
      refundRowsOf(p);
      // A full-waiver order is complimentary: no money came in, so no "received" row (it is reported as Waived).
      if (p.gateway === WAIVER_GATEWAY) continue;
      if (!receivedIn(p.paidAt ?? p.createdAt)) continue;
      receivables.push(
        row({
          id: `order:${p.id}`,
          date: date!,
          source: "company",
          status: "received",
          description: orderNotes(p.raw).mode === "hiring_fee"
            ? orderNotes(p.raw).firstMonthIds.length
              ? "Employer payment: hiring charge + month 1"
              : "Employer payment: hiring charge"
            : "Employer payment",
          companyName: input.employerName(p.employerId),
          candidateName: null,
          amountMinor: revenueMinorOf(p),
          currency: p.currency,
          reference: p.paymentId ?? p.orderId,
        }),
      );
    }

    for (const b of collegeBatchReceipts(input.collegeBatches ?? [])) {
      if (!receivedIn(b.at ? new Date(b.at) : null)) continue;
      receivables.push(
        row({
          id: `college_batch:${b.id}`,
          date: istDayKey(b.at)!,
          source: "college",
          status: "received",
          description: `College seat batch${b.invoiceNumber ? ` (invoice ${b.invoiceNumber})` : ""}`,
          companyName: input.collegeName?.(b.collegeId) ?? "College",
          candidateName: null,
          amountMinor: b.amountMinor,
          currency: "INR",
          reference: b.referenceId ?? b.invoiceNumber,
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
          amountMinor: acceptedLineCharge(offer, "upfront", { feeSetting: input.feeSetting, bandScore: input.scoreOf?.(p.internId) }).totalMinor,
          currency: offer.currency,
          reference: null,
        }),
      );
    }

    // A refunded order still counts as paid coverage: a refund never makes the company owe it again.
    const paidOrders = settledOrders(input.employerPayments);
    for (const d of monthlyDues(input.proposals, paidOrders)) {
      const p = input.proposals.find((x) => x.id === d.proposalId);
      if (!p) continue;
      const offer = parseOffer(p.offerDetails, p.currency);
      const instalment = acceptedLineCharge(offer, "monthly", { firstPayment: false }).totalMinor;
      for (let i = d.monthsPaid; i < d.months; i++) {
        // Post-paid: month k is due 2 days before the intern is paid for it, overdue the day after.
        const postpaid = d.plan === "postpaid";
        const date = postpaid ? postpaidDueOn(postpaidAnchor(offer.startDate, p.hiredAt), d.months, i + 1) : addMonthsIso(offer.startDate, i);
        if (!inRange(date)) continue;
        receivables.push(
          row({
            id: `instalment:${p.id}:${i + 1}`,
            date: date!,
            source: "company",
            status: postpaid && date! <= istDayKey(input.now ?? new Date())! ? "due" : "upcoming",
            description: postpaid ? `Month ${i + 1} of ${d.months} stipend (due 2 days before the intern is paid)` : `Monthly instalment ${i + 1} of ${d.months}`,
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
      const date = istDayKey(p.paidAt ?? p.createdAt);
      if (!receivedIn(p.paidAt ?? p.createdAt)) continue;
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
      const date = istDayKey(o.createdAt);
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

  // Withdrawals paid to a college: money out on the company side (a college is a customer, like an employer).
  if (filter.payables !== "candidate") {
    for (const p of input.collegePayouts ?? []) {
      if (p.status !== "paid" || !receivedIn(p.paidAt ?? p.createdAt)) continue;
      payables.push(
        row({
          id: `college_payout:${p.id}`,
          date: istDayKey(p.paidAt ?? p.createdAt)!,
          source: "college",
          status: "paid",
          description: "College withdrawal paid",
          companyName: input.collegeName?.(p.collegeId) ?? "College",
          candidateName: null,
          amountMinor: p.amountMinor,
          currency: "INR",
          reference: p.referenceId,
        }),
      );
    }
  }

  // Stipends are candidate-side; a "company" filter empties them.
  if (filter.payables !== "company") {
    for (const p of input.payouts) {
      // Only paid and pending payouts are money out or owed. A failed one is neither: the Payouts page
      // counts only 'pending', and its month is listed again as an upcoming stipend below (stipendDues).
      const state = String(p.status).toLowerCase();
      if (state !== "paid" && state !== "pending") continue;
      const scheduled = (p.raw as Record<string, unknown> | null)?.scheduledFor;
      // paidAt / createdAt are instants (India day); scheduledFor is already a date.
      const date = p.paidAt ? istDayKey(p.paidAt) : typeof scheduled === "string" && day(scheduled) ? day(scheduled) : istDayKey(p.createdAt);
      if (!inRange(date)) continue;
      payables.push(
        row({
          id: `payout:${p.id}`,
          date: date!,
          source: "candidate",
          status: state === "paid" ? "paid" : "pending",
          description: p.kind === "completion_bonus" ? "Completion bonus" : "Stipend payout",
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

  const totals = moneyTotals(receivables, payables);
  // Only present when a waived order exists, so the report for a ledger without any is unchanged to the byte.
  const waived = input.waivedOrders?.length ? waivedTotals(input.waivedOrders, receivedIn) : undefined;
  return { receivables, payables, totals, refunds, refundFlags, refundTotals: refundTotalsOf(refunds, totals.receivedMinor), ...(waived ? { waived } : {}) };
}

/** What full-waiver codes took off the orders they completed in the window (INR): the list value, not money. */
export function waivedTotals(orders: NonNullable<ReceivablesInput["waivedOrders"]>, inWindow: (at: Date | null | undefined) => boolean): { minor: number; count: number } {
  let minor = 0;
  let count = 0;
  for (const o of orders) {
    if (!isSettledStatus(o.status) || !inWindow(o.at)) continue;
    minor += toInrMinor(waiverFlagOf(o.raw)?.waivedMinor ?? 0, o.currency);
    count += 1;
  }
  return { minor, count };
}

/** What was refunded in the shown rows, the GST inside it, and received less refunded. */
export function refundTotalsOf(refunds: RefundRow[], receivedMinor: number): RefundTotals {
  const refundedMinor = refunds.reduce((s, r) => s + r.inrMinor, 0);
  return { refundedMinor, gstMinor: refunds.reduce((s, r) => s + r.gstInrMinor, 0), netReceivedMinor: receivedMinor - refundedMinor };
}

/** INR totals for the four report tiles, from whichever rows are shown. */
export function moneyTotals(receivables: MoneyRow[], payables: MoneyRow[]) {
  const total = (rows: MoneyRow[], statuses: MoneyRow["status"][]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.inrMinor, 0);
  return {
    receivedMinor: total(receivables, ["received"]),
    dueMinor: total(receivables, ["due", "upcoming"]),
    prospectMinor: total(receivables, ["unpaid"]),
    paidOutMinor: total(payables, ["paid"]),
    owedMinor: total(payables, ["pending", "upcoming"]),
  };
}

export type Receivables = ReturnType<typeof computeReceivables>;

export type MoneyRowFilter = { company: string; candidate: string; status: string };

export const MONEY_STATUSES: MoneyRow["status"][] = ["received", "due", "upcoming", "unpaid", "paid", "pending"];

/** Reads the report's row filters from the query (`company`, `candidate`, `status`). */
export function moneyRowFilter(params: Record<string, string | undefined>): MoneyRowFilter {
  const status = MONEY_STATUSES.find((s) => s === params.status) ?? "";
  return { company: (params.company ?? "").trim(), candidate: (params.candidate ?? "").trim(), status };
}

/**
 * Candidate / company / status filters on the money report (legacy had all
 * three on receivables, ADM-15). Names match by "contains", case-insensitive.
 */
export function filterMoneyRows(rows: MoneyRow[], f: MoneyRowFilter): MoneyRow[] {
  const company = f.company.toLowerCase();
  const candidate = f.candidate.toLowerCase();
  return rows.filter(
    (r) =>
      (!company || (r.companyName ?? "").toLowerCase().includes(company)) &&
      (!candidate || (r.candidateName ?? "").toLowerCase().includes(candidate)) &&
      (!f.status || r.status === f.status),
  );
}

/** Applies the row filters to a computed report and re-totals it. */
export function narrowReceivables(data: Receivables, f: MoneyRowFilter): Receivables {
  if (!f.company && !f.candidate && !f.status) return data;
  const receivables = filterMoneyRows(data.receivables, f);
  const payables = filterMoneyRows(data.payables, f);
  const totals = moneyTotals(receivables, payables);
  // Refunds are company rows: a candidate or status filter hides them, a company filter narrows them by name.
  const company = f.company.toLowerCase();
  const refunds = f.candidate || f.status ? [] : data.refunds.filter((r) => !company || (r.companyName ?? "").toLowerCase().includes(company));
  const shown = new Set(refunds.map((r) => r.orderId));
  return { receivables, payables, totals, refunds, refundFlags: data.refundFlags.filter((x) => shown.has(x.orderId)), refundTotals: refundTotalsOf(refunds, totals.receivedMinor), ...(data.waived ? { waived: data.waived } : {}) };
}
