import { orderNotes } from "./billing-plan.ts";
import { splitGst } from "./gst.ts";

/**
 * Refund accounting for employer orders. Pure: no DB, no React.
 *
 * A refund is a separate contra record, never a reopened receivable: the order keeps the amount it was
 * paid, the refunds are listed beside it (`raw.refunds`, one entry per gateway refund id), and
 * net paid = paid - refunded. employer_payments has no refund column, so the list lives in the order's
 * `raw` jsonb like `receivedAt` does; a schema change is for the owner to decide.
 *
 * Status is derived from the amounts, not read from the label. Only a row with no amounts at all falls
 * back to its label (`labelOnly`), because that is all the row says.
 */

export type RefundEntry = { id: string; amountMinor: number; status: string; at?: string | null; creditNote?: string | null };

type OrderLike = { status: string; amountMinor: number; currency: string; raw: unknown };

export type OrderRefundView = {
  paidMinor: number;
  refundedMinor: number;
  netMinor: number;
  currency: string;
  status: "paid" | "partially_refunded" | "refunded";
  /** Processed refunds, one per gateway refund id. */
  refunds: RefundEntry[];
  /** More was recorded as refunded than was paid; `refundedMinor` is capped at paid. */
  overRefunded: boolean;
  /** No refund amounts are recorded; the figures come from the status label alone. */
  labelOnly: boolean;
};

const SETTLED = new Set(["paid", "refunded", "partially_refunded"]);
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Rows whose money was received: paid, and the two refund labels (the order was paid first). */
/** For SQL `IN (...)`: the statuses of rows whose money was received. */
export const SETTLED_STATUSES = ["paid", "refunded", "partially_refunded"];
export const isSettledStatus = (status: unknown): boolean => SETTLED.has(norm(status));

const rawOf = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});

function entriesOf(raw: unknown): RefundEntry[] {
  const list = rawOf(raw).refunds;
  if (!Array.isArray(list)) return [];
  const out: RefundEntry[] = [];
  for (const x of list) {
    const e = rawOf(x);
    const id = String(e.id ?? "").trim();
    const amountMinor = Number(e.amountMinor);
    if (!id || !Number.isFinite(amountMinor) || amountMinor <= 0) continue;
    out.push({ id, amountMinor: Math.round(amountMinor), status: norm(e.status), at: typeof e.at === "string" ? e.at : null, creditNote: typeof e.creditNote === "string" && e.creditNote.trim() ? e.creditNote.trim() : null });
  }
  return out;
}

export function orderRefunds(o: OrderLike): OrderRefundView {
  const paidMinor = isSettledStatus(o.status) ? Math.max(0, Math.round(Number(o.amountMinor) || 0)) : 0;
  const seen = new Set<string>();
  const refunds = entriesOf(o.raw).filter((e) => {
    if (e.status !== "processed" || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  const label = norm(o.status);
  let sum = refunds.reduce((s, e) => s + e.amountMinor, 0);
  const labelOnly = refunds.length === 0 && (label === "refunded" || label === "partially_refunded");
  if (labelOnly && label === "refunded") sum = paidMinor;
  const refundedMinor = Math.min(sum, paidMinor);
  const status = labelOnly && label === "partially_refunded" ? "partially_refunded" : refundedMinor <= 0 ? "paid" : refundedMinor >= paidMinor ? "refunded" : "partially_refunded";
  return { paidMinor, refundedMinor, netMinor: paidMinor - refundedMinor, currency: String(o.currency ?? "INR").toUpperCase(), status, refunds, overRefunded: sum > paidMinor, labelOnly };
}

type SettledLike = { status: string; amountMinor?: number; currency?: string; raw: unknown; paidAt?: Date | string | null };

const at = (o: { paidAt?: Date | string | null }) => (o.paidAt ? new Date(o.paidAt).getTime() || 0 : 0);
const sameSet = (inner: string[], outer: string[]) => inner.every((x) => outer.includes(x));

/**
 * The orders that count as paid coverage for a hire (months paid, plan, what is still due): paid ones, and
 * refunded ones relabelled "paid", so a refund never makes the company owe the amount again. A fully
 * refunded order is dropped when a later paid order of the same kind covers the same hires (refunded and
 * then paid again), so the second payment is not counted on top of the first. Untouched when no row is
 * refunded: the same objects come back.
 */
export function settledOrders<T extends SettledLike>(orders: readonly T[]): T[] {
  const paid = orders.filter((o) => norm(o.status) === "paid");
  const out: T[] = [];
  for (const o of orders) {
    const s = norm(o.status);
    if (s === "paid") {
      out.push(o);
      continue;
    }
    if (s !== "refunded" && s !== "partially_refunded") continue;
    const view = orderRefunds({ status: o.status, amountMinor: o.amountMinor ?? 0, currency: o.currency ?? "INR", raw: o.raw });
    if (view.status === "refunded") {
      const a = orderNotes(o.raw);
      const again = paid.some((p) => {
        const b = orderNotes(p.raw);
        return at(p) >= at(o) && b.mode === a.mode && a.ids.length > 0 && sameSet(a.ids, b.ids) && sameSet(a.dueIds, b.dueIds);
      });
      if (again) continue;
    }
    out.push({ ...o, status: "paid" });
  }
  return out;
}

export type GatewayRefundEntity = { id?: string; amount?: number; status?: string; created_at?: number };
export type RecordPlan =
  | { kind: "recorded"; raw: Record<string, unknown> }
  | { kind: "duplicate" | "over_paid" | "ignored" };

/**
 * What a verified refund.processed event does to an order. A refund id already on the order is a replay
 * (nothing changes); a refund that would take the total above what was paid is refused, not stored.
 */
export function planRefundRecord(order: OrderLike, entity: GatewayRefundEntity): RecordPlan {
  const id = String(entity.id ?? "").trim();
  const amountMinor = Math.round(Number(entity.amount));
  if (!id || norm(entity.status) !== "processed" || !Number.isFinite(amountMinor) || amountMinor <= 0 || !isSettledStatus(order.status)) return { kind: "ignored" };
  if (entriesOf(order.raw).some((e) => e.id === id)) return { kind: "duplicate" };
  const view = orderRefunds(order);
  if (view.refundedMinor + amountMinor > view.paidMinor) return { kind: "over_paid" };
  const created = Number(entity.created_at);
  const entry: RefundEntry = { id, amountMinor, status: "processed", at: Number.isFinite(created) && created > 0 ? new Date(created * 1000).toISOString() : null };
  const raw = rawOf(order.raw);
  return { kind: "recorded", raw: { ...raw, refunds: [...entriesOf(raw), entry] } };
}

/** The GST inside a refunded amount: the inclusive 18% split, rounded like a payment's. Export (USD) orders carry none. */
export function refundGstMinor(amountMinor: number, currency: string | null | undefined): number {
  if (!(amountMinor > 0) || norm(currency) === "usd") return 0;
  const s = splitGst(amountMinor, { kind: "india", stateCode: "27", stateName: "Maharashtra" });
  return s.cgstMinor + s.sgstMinor + s.igstMinor;
}
