import { isSettledStatus } from "./refund-accounting.ts";

/** Why an order's invoice can't be re-sent to the company, or null. Only received money with a number issued has a tax invoice (refunds keep it). */
export function resendInvoiceRefusal(order: { status: string; amountMinor: number; invoiceNumber: string | null }): string | null {
  if (!isSettledStatus(order.status) || !(order.amountMinor > 0)) return "There is no tax invoice for an order that is not paid.";
  if (!order.invoiceNumber) return "This order has no invoice number yet.";
  return null;
}
