import { orderReview } from "../payment-flags.ts";
import { orderRefunds } from "../refund-accounting.ts";

type OrderRow = {
  id: string; employerId: string; gateway: string; orderId: string; paymentId: string | null; amountMinor: number; currency: string;
  status: string; paidAt: Date | null; invoiceNumber: string | null; createdAt: Date | null; raw: unknown;
};

/** One order as the admin list API returns it: money, ids and flags. Never the payment signature or the raw jsonb (buyer GSTIN snapshot, gateway blobs). */
export function publicOrder(o: OrderRow) {
  const view = orderRefunds(o);
  return {
    id: o.id, employerId: o.employerId, gateway: o.gateway, orderId: o.orderId, paymentId: o.paymentId,
    amountMinor: o.amountMinor, currency: o.currency, status: o.status, invoiceNumber: o.invoiceNumber,
    paidAt: o.paidAt, createdAt: o.createdAt,
    refundedMinor: view.refundedMinor, netMinor: view.netMinor,
    needsReview: orderReview(o.raw as Record<string, unknown> | null).flagged,
  };
}
