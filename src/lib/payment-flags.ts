/**
 * Money that arrives from the gateway and does not fit the order it names. Pure: no DB, no React.
 *
 * - The amount check: Razorpay's own account of what was paid is compared with the amount stored on our
 *   order. A mismatch is refused (the order is not settled) and recorded in `raw.amountMismatches`.
 * - A duplicate payment: a second, different payment id for an order that is already paid. The order stays
 *   settled by the first payment; the second is recorded in `raw.duplicatePayments` so accounts refund it.
 * Both live in the order's `raw` jsonb (no schema change) and show as "Needs review" on admin Orders.
 */

type Raw = Record<string, unknown> | null | undefined;

export type GatewayPaid = { amountMinor?: unknown; currency?: unknown };

export type AmountProblem = {
  reason: "amount_mismatch" | "currency_mismatch" | "amount_missing";
  expectedMinor: number;
  paidMinor: number | null;
  expectedCurrency: string;
  paidCurrency: string | null;
};

const cur = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** null when what the gateway says was paid equals what the order stores. A signed event with no usable amount is refused too. */
export function paidAmountProblem(stored: { amountMinor: number; currency: string }, paid: GatewayPaid): AmountProblem | null {
  const base = { expectedMinor: stored.amountMinor, expectedCurrency: cur(stored.currency) || "INR", paidCurrency: cur(paid.currency) || null };
  if (typeof paid.amountMinor !== "number" || !Number.isInteger(paid.amountMinor)) return { ...base, reason: "amount_missing", paidMinor: null };
  const paidMinor = paid.amountMinor;
  if (base.paidCurrency !== base.expectedCurrency) return { ...base, reason: "currency_mismatch", paidMinor };
  if (paidMinor !== stored.amountMinor) return { ...base, reason: "amount_mismatch", paidMinor };
  return null;
}

const rawOf = (raw: Raw): Record<string, unknown> => (raw && typeof raw === "object" ? raw : {});
const listOf = (raw: Raw, key: string): Record<string, unknown>[] => {
  const v = rawOf(raw)[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
};

/** The order's new `raw` with this refused payment recorded; null when that payment id is already recorded (a replay). */
export function planAmountMismatch(raw: Raw, paymentId: string, problem: AmountProblem, at: Date): { raw: Record<string, unknown> } | null {
  const list = listOf(raw, "amountMismatches");
  if (list.some((e) => e.paymentId === paymentId)) return null;
  const entry = { paymentId, reason: problem.reason, expectedMinor: problem.expectedMinor, paidMinor: problem.paidMinor, expectedCurrency: problem.expectedCurrency, paidCurrency: problem.paidCurrency, at: at.toISOString() };
  return { raw: { ...rawOf(raw), amountMismatches: [...list, entry] } };
}

/** The order's new `raw` when `paymentId` is a second payment for an order already paid by another; null when it is not (same id, unpaid order, no payment on file) or is already recorded. */
export function planDuplicatePayment(
  order: { status: string; paymentId: string | null; raw: Raw },
  paymentId: string,
  paid: GatewayPaid,
  at: Date,
): { raw: Record<string, unknown> } | null {
  if (order.status !== "paid" || !order.paymentId || order.paymentId === paymentId) return null;
  const list = listOf(order.raw, "duplicatePayments");
  if (list.some((e) => e.paymentId === paymentId)) return null;
  const entry = {
    paymentId,
    amountMinor: typeof paid.amountMinor === "number" ? paid.amountMinor : null,
    currency: cur(paid.currency) || null,
    firstPaymentId: order.paymentId,
    at: at.toISOString(),
  };
  return { raw: { ...rawOf(order.raw), duplicatePayments: [...list, entry] } };
}

export type ReviewReason = { code: "not_all_hired" | "month_mismatch" | "duplicate_payment" | "amount_mismatch"; label: string };

/** Everything on an order that accounts must look at: the settle flag plus the two lists above. */
export function orderReview(raw: Raw): { flagged: boolean; reasons: ReviewReason[] } {
  const reasons: ReviewReason[] = [];
  const nr = rawOf(raw).needsReview as { reason?: unknown } | undefined | null;
  if (nr && typeof nr === "object") {
    reasons.push(
      nr.reason === "month_mismatch"
        ? { code: "month_mismatch", label: "A month was paid out of turn" }
        : { code: "not_all_hired", label: "Paid, but not every placement could be confirmed: refund the difference" },
    );
  } else if (nr) {
    reasons.push({ code: "not_all_hired", label: "Paid, but not every placement could be confirmed: refund the difference" });
  }
  const dups = listOf(raw, "duplicatePayments").length;
  if (dups) reasons.push({ code: "duplicate_payment", label: `${dups === 1 ? "A second payment" : `${dups} more payments`} came in for this order: refund the extra` });
  const mism = listOf(raw, "amountMismatches").length;
  if (mism) reasons.push({ code: "amount_mismatch", label: `${mism === 1 ? "A payment" : `${mism} payments`} did not match the order amount and ${mism === 1 ? "was" : "were"} not settled` });
  return { flagged: reasons.length > 0, reasons };
}

/** The payment a captured / order.paid webhook describes: ids plus the amount and currency Razorpay says were paid. null when it names no order or payment. */
export function webhookPayment(event: { payload?: { payment?: { entity?: { id?: unknown; order_id?: unknown; amount?: unknown; currency?: unknown } } } }):
  { orderId: string; paymentId: string; paid: { amountMinor: unknown; currency: unknown } } | null {
  const e = event.payload?.payment?.entity;
  if (typeof e?.order_id !== "string" || !e.order_id || typeof e.id !== "string" || !e.id) return null;
  return { orderId: e.order_id, paymentId: e.id, paid: { amountMinor: e.amount, currency: e.currency } };
}
