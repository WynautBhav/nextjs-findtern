/**
 * The Finance tab's figures, shaped from grouped database rows. Pure: no DB, no React.
 *
 * Every definition is the existing money layer's (lib/admin/revenue.ts, receivables-load.ts), so the tab
 * reconciles with Orders, Intern invoices, Transactions, Payouts and Money in/out:
 *   - COLLECTED = INR sum of settled employer orders (paid, refunded, partially_refunded) plus paid intern
 *     activation fees that are not college-drive waivers; USD at the business rate. Waived (full-promo)
 *     orders add 0 and are counted apart.
 *   - DISCOUNTS = the promo discount recorded on settled rows (waived orders included: a full waiver IS a discount).
 *   - REFUNDS = `loadRefundedWithin` (refunds dated in the period), passed in; collected stays gross.
 *   - GST = 18% inside INR amounts (lib/gst.ts: listed prices are GST-inclusive), none on dollar orders (export).
 */
import { toInrMinor } from "../money.ts";
import { isSettledStatus } from "../../refund-accounting.ts";

export const WAIVER_METHOD = "promo_full_waiver";
const DRIVE_WAIVER_GATEWAY = "college_drive";
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * A complimentary order: the full-waiver promo (gateway or method `promo_full_waiver`, being added), or the
 * existing shapes of the same thing: the legacy 100%-code row (gateway `free`, amount 0) or a zero-amount
 * order that carries a promo code or recorded discount. A plain ₹0 order with none of those is not.
 * Only string comparisons, so it is right before and after the new flag ships.
 */
export function isWaivedOrder(o: { gateway?: string | null; method?: string | null; amountMinor?: number | null; promoCode?: string | null; discountMinor?: number | null }): boolean {
  if (norm(o.gateway) === WAIVER_METHOD || norm(o.method) === WAIVER_METHOD) return true;
  if (Number(o.amountMinor ?? 1) !== 0) return false;
  return norm(o.gateway) === "free" || Boolean(norm(o.promoCode)) || Number(o.discountMinor ?? 0) > 0;
}

/** GST inside a GST-inclusive INR amount (18%); a dollar order is an export: none. Per row, rounded like `splitGst`. */
export function gstInclusive(amountMinor: number, currency: string): number {
  if (norm(currency) === "usd") return 0;
  return amountMinor - Math.round(amountMinor / 1.18);
}

export type PayGroup = {
  kind: "employer" | "intern";
  status: string;
  currency: string;
  gateway: string;
  method: string;
  /** amount_minor = 0 */
  zero: boolean;
  /** a promo code is recorded on the row */
  promo: boolean;
  count: number;
  amountMinor: number;
  discountMinor: number;
  /** GST inside the group's INR amounts, summed per row in SQL (`gstInclusive`); derived from the sum when absent. */
  gstMinor?: number;
};

type Cell = { count: number; inrMinor: number };
const cell = (): Cell => ({ count: 0, inrMinor: 0 });
const add = (c: Cell, count: number, inr: number) => {
  c.count += count;
  c.inrMinor += inr;
};

export type OrderStatusKey = "paid" | "refunded" | "partially_refunded" | "unpaid" | "failed" | "other";
export const statusKey = (status: string): OrderStatusKey => {
  const s = norm(status);
  if (s === "paid" || s === "refunded" || s === "partially_refunded") return s;
  if (["created", "pending", "unpaid", "attempted", "open", "processing"].includes(s)) return "unpaid";
  if (["failed", "cancelled", "canceled", "expired"].includes(s)) return "failed";
  return "other";
};
const statusCells = (): Record<OrderStatusKey, Cell> => ({ paid: cell(), refunded: cell(), partially_refunded: cell(), unpaid: cell(), failed: cell(), other: cell() });

export type FinanceFigures = {
  collectedMinor: number;
  collectedCount: number;
  refundedMinor: number;
  netCollectedMinor: number;
  discountMinor: { employer: number; intern: number; total: number };
  gstMinor: number;
  employer: { orders: Cell; collected: Cell; notCollected: Cell; byStatus: Record<OrderStatusKey, Cell> };
  intern: { fees: Cell; collected: Cell; notCollected: Cell; byStatus: Record<OrderStatusKey, Cell> };
  currency: { INR: { count: number; minor: number }; USD: { count: number; minor: number; inrEquivalentMinor: number } };
  waived: { count: number; employer: number; intern: number; /** amount + discount of waived rows; null when none of them recorded a discount. */ listInrMinor: number | null; collegeDrive: number };
};

export function shapeFinance(groups: readonly PayGroup[], opts: { refundedMinor: number }): FinanceFigures {
  const f: FinanceFigures = {
    collectedMinor: 0, collectedCount: 0, refundedMinor: opts.refundedMinor, netCollectedMinor: 0,
    discountMinor: { employer: 0, intern: 0, total: 0 }, gstMinor: 0,
    employer: { orders: cell(), collected: cell(), notCollected: cell(), byStatus: statusCells() },
    intern: { fees: cell(), collected: cell(), notCollected: cell(), byStatus: statusCells() },
    currency: { INR: { count: 0, minor: 0 }, USD: { count: 0, minor: 0, inrEquivalentMinor: 0 } },
    waived: { count: 0, employer: 0, intern: 0, listInrMinor: 0, collegeDrive: 0 },
  };
  let waivedWithDiscount = 0;
  for (const g of groups) {
    const side = g.kind === "employer" ? f.employer : f.intern;
    const inr = toInrMinor(g.amountMinor, g.currency);
    const discountInr = toInrMinor(g.discountMinor, g.currency);
    const total = g.kind === "employer" ? f.employer.orders : f.intern.fees;
    add(total, g.count, inr);
    add(side.byStatus[statusKey(g.status)], g.count, inr);

    // Money received: employer = settled labels; intern = paid (the drive waiver is no receipt).
    const settled = g.kind === "employer" ? isSettledStatus(g.status) : norm(g.status) === "paid";
    if (!settled) {
      add(side.notCollected, g.count, inr);
      continue;
    }
    if (g.kind === "intern" && norm(g.gateway) === DRIVE_WAIVER_GATEWAY) {
      f.waived.collegeDrive += g.count;
      continue;
    }
    f.discountMinor[g.kind] += discountInr;
    f.discountMinor.total += discountInr;
    const waived = isWaivedOrder({ gateway: g.gateway, method: g.method, amountMinor: g.zero ? 0 : 1, promoCode: g.promo ? "x" : null, discountMinor: g.discountMinor });
    if (waived) {
      f.waived.count += g.count;
      f.waived[g.kind] += g.count;
      if (g.discountMinor > 0) {
        waivedWithDiscount += g.count;
        f.waived.listInrMinor = (f.waived.listInrMinor ?? 0) + inr + discountInr;
      }
      continue;
    }
    add(side.collected, g.count, inr);
    f.collectedMinor += inr;
    f.collectedCount += g.count;
    f.gstMinor += g.currency.toUpperCase() === "USD" ? 0 : gstFromGroup(g);
    if (g.currency.toUpperCase() === "USD") {
      f.currency.USD.count += g.count;
      f.currency.USD.minor += g.amountMinor;
      f.currency.USD.inrEquivalentMinor += inr;
    } else {
      f.currency.INR.count += g.count;
      f.currency.INR.minor += g.amountMinor;
    }
  }
  if (f.waived.count > 0 && waivedWithDiscount === 0) f.waived.listInrMinor = null;
  f.netCollectedMinor = f.collectedMinor - f.refundedMinor;
  return f;
}

/** GST over a group: rounding is per row in SQL (`gst_minor`), so a group may carry it; else derive from the sum (exact when one row). */
function gstFromGroup(g: PayGroup): number {
  return g.gstMinor ?? gstInclusive(g.amountMinor, g.currency);
}

// ------------------------------------------------------------------ payouts

export type PayoutGroup = { kind: string; status: string; currency: string; count: number; amountMinor: number };
export type PayoutFigures = {
  stipend: { paid: Cell; pending: Cell; failed: Cell; other: Cell };
  completionBonus: { paid: Cell; pending: Cell; failed: Cell; other: Cell };
  /** Status `paid`, every kind: what Payouts and Money in/out call paid out (before college withdrawals). */
  paidOutMinor: number;
  paidOutCount: number;
  /** Status `pending`, every kind: what the Payouts page calls pending. */
  pendingMinor: number;
  pendingCount: number;
};

export function shapePayouts(groups: readonly PayoutGroup[]): PayoutFigures {
  const blank = () => ({ paid: cell(), pending: cell(), failed: cell(), other: cell() });
  const out: PayoutFigures = { stipend: blank(), completionBonus: blank(), paidOutMinor: 0, paidOutCount: 0, pendingMinor: 0, pendingCount: 0 };
  for (const g of groups) {
    const s = norm(g.status);
    const key = s === "paid" || s === "pending" || s === "failed" ? s : "other";
    const inr = toInrMinor(g.amountMinor, g.currency);
    add((norm(g.kind) === "completion_bonus" ? out.completionBonus : out.stipend)[key], g.count, inr);
    if (s === "paid") {
      out.paidOutMinor += inr;
      out.paidOutCount += g.count;
    } else if (s === "pending") {
      out.pendingMinor += inr;
      out.pendingCount += g.count;
    }
  }
  return out;
}
