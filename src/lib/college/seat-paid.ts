import { capAfterPaid } from "./money.ts";

/**
 * The effect of marking a seat batch paid, pure. The route's conditional
 * `pending -> paid` UPDATE decides the status; a batch that is no longer pending
 * yields no cap change, so a second mark-paid (double click, two admins) cannot raise it again.
 */
export function paidTransition(input: { status: string; cap: number | null; paidSeatsBefore: number; seats: number }): { ok: false } | { ok: true; cap: number } {
  if (input.status !== "pending") return { ok: false };
  return { ok: true, cap: capAfterPaid(input) };
}

export const AWAITING_FIRST_PAYMENT = "Awaiting first payment";

/** Owner rule: a college's TPO login and code exist only once its first seat batch is paid. Null when at least one is. */
export function firstPaymentProblem(paidBatches: number): string | null {
  return paidBatches > 0 ? null : AWAITING_FIRST_PAYMENT;
}
