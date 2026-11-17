import { toInrMinor } from "./money.ts";
import { orderRefunds } from "../refund-accounting.ts";

type OrderLike = { status: string; amountMinor: number; currency: string; raw: unknown; paidAt?: Date | string | null };

const ms = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/**
 * Money refunded (INR minor, USD at the business rate) with the refund dated in [since, until); an open bound is
 * open. A refund counts on the day it was made, not the day its order was paid, so a week's tile can show
 * "collected - refunded" for that week. A refund with no date takes the order's paid date. Per order, refunds are
 * capped at what the order paid (orderRefunds), and test employers are the caller's to leave out.
 */
export function refundedInrMinorWithin(orders: readonly OrderLike[], range: { since?: Date | null; until?: Date | null }): number {
  const since = range.since ? range.since.getTime() : -Infinity;
  const until = range.until ? range.until.getTime() : Infinity;
  let total = 0;
  for (const o of orders) {
    const view = orderRefunds(o);
    if (view.refundedMinor <= 0) continue;
    // Label-only rows have no refund entries: the whole order is refunded as of its paid date.
    const entries = view.refunds.length ? view.refunds : [{ id: "label", amountMinor: view.refundedMinor, at: null as string | null }];
    let left = view.refundedMinor; // the cap, applied in the order the refunds were made
    const dated = entries.map((e) => ({ amountMinor: e.amountMinor, t: ms(e.at) || ms(o.paidAt) })).sort((a, b) => a.t - b.t);
    for (const e of dated) {
      const take = Math.min(e.amountMinor, left);
      left -= take;
      if (take > 0 && e.t >= since && e.t < until) total += toInrMinor(take, o.currency);
    }
  }
  return total;
}
