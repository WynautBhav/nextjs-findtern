import { engagementPeriods } from "./employer-timesheets.ts";

/**
 * How an internship hire is billed: the ONE place that reads an employer
 * order's `paymentMode` (WPP$). Every reader (checkout, dues, invoices, admin
 * ledgers, payout gate) goes through here. An unknown or missing mode reads as
 * "upfront" (paid in full): that is right for today's data, where legacy orders
 * carry "total" or no mode. A new mode must be added here, and to the two
 * ledgers that default to paid in full on their own (`placementLedger` in
 * dues.ts, `company-ledger.ts`), or it will read as paid.
 *
 *  - upfront          first order "total"/"upfront", no mode, or any unknown mode: everything paid at hire.
 *  - monthly_prepaid  first order "monthly": month 1 + fee at hire, each later month at its start (grandfathered).
 *  - postpaid         first order "hiring_fee": the fee only at hire; month k is due on the last day of month k.
 *  - unpaid           no paid order names the hire yet.
 * The plan is decided by the OLDEST paid order naming the hire, so hires paid
 * before this rule shipped keep their plan with no backfill.
 */

export type BillingPlan = "upfront" | "monthly_prepaid" | "postpaid" | "unpaid";

/** `paidAt` orders the orders; without it the array order is used. */
export type PlanOrder = { status: string; raw: unknown; paidAt?: Date | string | null };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function list(v: unknown): string[] {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}

/** What an order's notes say: the proposals it names, the due months it pays, and its (lower-cased) mode. */
export function orderNotes(raw: unknown): { ids: string[]; dueIds: string[]; mode: string } {
  const r = obj(raw);
  const n = obj(r.notes ?? obj(r.order).notes);
  return {
    ids: list(n.proposalIds ?? n.proposal_ids ?? r.proposalIds ?? r.proposal_ids),
    dueIds: list(n.dueProposalIds),
    mode: String(n.paymentMode ?? n.payment_mode ?? "").trim().toLowerCase(),
  };
}

const at = (o: PlanOrder) => {
  const t = o.paidAt ? new Date(o.paidAt).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/** Paid orders, oldest first (stable when `paidAt` is missing). */
export const paidOldestFirst = <T extends PlanOrder>(orders: readonly T[]): T[] =>
  orders.filter((o) => String(o.status).toLowerCase() === "paid").sort((a, b) => at(a) - at(b));

export function billingPlanOf(proposalId: string, orders: readonly PlanOrder[]): BillingPlan {
  for (const o of paidOldestFirst(orders)) {
    const { ids, mode } = orderNotes(o.raw);
    if (!ids.includes(proposalId)) continue;
    return mode === "hiring_fee" ? "postpaid" : mode === "monthly" ? "monthly_prepaid" : "upfront";
  }
  return "unpaid";
}

/** Months of stipend a post-paid hire has paid: orders carrying it as a due month. The fee order is not one. */
export function postpaidMonthsPaid(proposalId: string, orders: readonly PlanOrder[]): number {
  return paidOldestFirst(orders).filter((o) => orderNotes(o.raw).dueIds.includes(proposalId)).length;
}

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export function istDay(d: Date | string | null | undefined): string | null {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** The anchor month 1 counts from: the offer's start date, else the IST day the hire was paid. */
export const postpaidAnchor = (startDate: string | null | undefined, hiredAt: Date | string | null | undefined): string | null =>
  /^\d{4}-\d{2}-\d{2}/.test(String(startDate ?? "")) ? String(startDate).slice(0, 10) : istDay(hiredAt);

/** YYYY-MM-DD month `k` (1-based) is due: the last day of that engagement month (same periods as timesheets). Null when no anchor or k is out of range. */
export function postpaidDueOn(anchor: string | null | undefined, months: number, k: number): string | null {
  if (!anchor || !Number.isInteger(k) || k < 1 || k > months) return null;
  return engagementPeriods(anchor, months)[k - 1]?.end ?? null;
}

export type PostpaidNext = { k: number; dueOn: string; payable: boolean };

/** The next unpaid month of a post-paid hire; null when all are paid or the anchor is unknown. */
export function postpaidNext(anchor: string | null | undefined, months: number, monthsPaid: number, todayIst: string): PostpaidNext | null {
  const k = monthsPaid + 1;
  const dueOn = postpaidDueOn(anchor, months, k);
  return dueOn ? { k, dueOn, payable: todayIst >= dueOn } : null;
}
