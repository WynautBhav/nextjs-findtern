import { engagementPeriods } from "./employer-timesheets.ts";
import { isRealDay } from "./offer.ts";

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
 *  - postpaid         first order "hiring_fee": the fee only at hire; month k is due 2 days before the intern is paid for it (stipendMonthDates).
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

/** The month number (1-based) each due line of an order was priced for, from `notes.dueMonths` (`{ proposalId: month }`). Orders from before it was written have none. */
export function orderDueMonths(raw: unknown): Record<string, number> {
  const r = obj(raw);
  const n = obj(r.notes ?? obj(r.order).notes);
  const out: Record<string, number> = {};
  for (const [id, k] of Object.entries(obj(n.dueMonths))) if (Number.isInteger(k) && (k as number) >= 1) out[id] = k as number;
  return out;
}

/**
 * Due lines of `order` that are not the month their placement actually owed: a post-paid hire whose paid months
 * (in `others`, the employer's other paid orders) are not `dueMonth - 1`, e.g. two checkouts for month 2 settling
 * back to back. Pay-at-start lines and orders without `dueMonths` are not checked.
 */
export function monthMismatches(order: unknown, others: readonly PlanOrder[]): { proposalId: string; dueMonth: number; monthsPaid: number }[] {
  const months = orderDueMonths(order);
  const out: { proposalId: string; dueMonth: number; monthsPaid: number }[] = [];
  for (const id of orderNotes(order).dueIds) {
    const dueMonth = months[id];
    if (dueMonth === undefined || billingPlanOf(id, others) !== "postpaid") continue;
    const monthsPaid = postpaidMonthsPaid(id, others);
    if (monthsPaid !== dueMonth - 1) out.push({ proposalId: id, dueMonth, monthsPaid });
  }
  return out;
}

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export function istDay(d: Date | string | null | undefined): string | null {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** The anchor month 1 counts from: the offer's start date, else the IST day the hire was paid. */
export const postpaidAnchor = (startDate: string | null | undefined, hiredAt: Date | string | null | undefined): string | null =>
  /^\d{4}-\d{2}-\d{2}/.test(String(startDate ?? "")) ? String(startDate).slice(0, 10) : istDay(hiredAt);

/** YYYY-MM-DD plus `months` calendar months, clamped to the target month's last day (31 Jan + 1 = 28/29 Feb). */
function addMonthsDay(day: string, months: number): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

const addDaysDay = (day: string, days: number) => new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Days before the intern's pay day that the employer's month falls due, so Findtern never pays an intern before the employer has paid. */
export const EMPLOYER_DUE_LEAD_DAYS = 2;
/** Days before the employer's due day that month k can be paid (and reminders start). */
export const PAY_WINDOW_DAYS = 15;

/**
 * The ONE place stipend dates come from. Month `k` (1-based) of an engagement starting `anchor` (YYYY-MM-DD, IST):
 *  - `internPayOn`: the intern is paid for it on anchor + k months (end of the month worked, clamped).
 *  - `employerDueOn`: the employer owes it EMPLOYER_DUE_LEAD_DAYS (2) days earlier.
 *  - `payableFrom`: the employer can pay it from PAY_WINDOW_DAYS (15) days before that.
 * Null when there is no anchor or `k` is not 1..months.
 */
export function stipendMonthDates(
  anchor: string | null | undefined,
  months: number,
  k: number,
): { internPayOn: string; employerDueOn: string; payableFrom: string } | null {
  if (!anchor || !isRealDay(anchor.slice(0, 10)) || !Number.isInteger(k) || k < 1 || k > months) return null;
  const internPayOn = addMonthsDay(anchor, k);
  const employerDueOn = addDaysDay(internPayOn, -EMPLOYER_DUE_LEAD_DAYS);
  return { internPayOn, employerDueOn, payableFrom: addDaysDay(employerDueOn, -PAY_WINDOW_DAYS) };
}

/** YYYY-MM-DD the employer owes month `k` (1-based): 2 days before the intern's pay day for it. Null when no anchor or k is out of range. */
export function postpaidDueOn(anchor: string | null | undefined, months: number, k: number): string | null {
  return stipendMonthDates(anchor, months, k)?.employerDueOn ?? null;
}

/** YYYY-MM-DD the last engagement month ends (as timesheets count it), e.g. 6 Nov + 2 months ends 5 Jan. */
export function engagementEndOn(anchor: string | null | undefined, months: number): string | null {
  if (!anchor || !isRealDay(anchor.slice(0, 10)) || months < 1) return null;
  return engagementPeriods(anchor, months).at(-1)?.end ?? null;
}

export type PostpaidNext = { k: number; dueOn: string; payable: boolean };

/** The next unpaid month of a post-paid hire; null when all are paid or the anchor is unknown. Payable from 15 days before its due day, and any time after. */
export function postpaidNext(anchor: string | null | undefined, months: number, monthsPaid: number, todayIst: string): PostpaidNext | null {
  const k = monthsPaid + 1;
  const d = stipendMonthDates(anchor, months, k);
  return d ? { k, dueOn: d.employerDueOn, payable: todayIst >= d.payableFrom } : null;
}
