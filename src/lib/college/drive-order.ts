/** Drive order rules, pure (no DB). Money is integer paise. The fee is per order; there is no default here. */

export const DRIVE_ORDER_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded"] as const;
export type DriveOrderStatus = (typeof DRIVE_ORDER_STATUSES)[number];

export const MAX_SLOTS = 100000;
/** ₹1,00,000 per student, in paise: a sanity bound. */
export const MAX_FEE_MINOR = 10_000_000;
/** amount_minor is a Postgres int4. */
const INT4_MAX = 2147483647;

export type DriveOrderLike = {
  status: string;
  slots: number;
  issuedCount: number;
  amountMinor?: number;
  creditMinor?: number;
};

export type OrderInput = { slots: number; feePerStudentMinor: number; creditMinor?: number; codeValidUntil: Date };
export type OrderValue = { slots: number; feePerStudentMinor: number; creditMinor: number; amountMinor: number; payableMinor: number; codeValidUntil: Date };

export function computeAmounts(slots: number, feePerStudentMinor: number, creditMinor = 0) {
  const amountMinor = slots * feePerStudentMinor;
  return { amountMinor, creditMinor, payableMinor: amountMinor - creditMinor };
}

export function validateOrderInput(input: OrderInput, now: Date): { ok: true; value: OrderValue } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const { slots, feePerStudentMinor, codeValidUntil } = input;
  const credit = input.creditMinor ?? 0;
  if (!Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS) errors.push(`Slots must be a whole number from 1 to ${MAX_SLOTS}`);
  if (!Number.isInteger(feePerStudentMinor) || feePerStudentMinor < 1 || feePerStudentMinor > MAX_FEE_MINOR) errors.push("Fee per student is out of range");
  if (!Number.isInteger(credit) || credit < 0) errors.push("Credit must be a non-negative whole number of paise");
  if (!(codeValidUntil instanceof Date) || Number.isNaN(codeValidUntil.getTime()) || codeValidUntil.getTime() <= now.getTime()) errors.push("Code validity must be in the future");
  if (errors.length) return { ok: false, errors };
  const a = computeAmounts(slots, feePerStudentMinor, credit);
  if (a.amountMinor > INT4_MAX) errors.push("Order amount is too large");
  if (credit > a.amountMinor) errors.push("Credit cannot exceed the order amount");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { slots, feePerStudentMinor, ...a, codeValidUntil } };
}

/** The conditional UPDATE that must carry the transition: only a pending row matches, so a second run updates 0 rows. */
export const PAID_TRANSITION_WHERE = "id = $1 AND status = 'pending'";

export function markPaidTransition(
  order: { status: string },
  input: { reference: string; verifiedBy: string; now: Date },
): { ok: false; reason: "not_pending" } | { ok: true; set: { status: "paid"; paidAt: Date; gatewayRef: string; verifiedBy: string; updatedAt: Date } } {
  if (order.status !== "pending") return { ok: false, reason: "not_pending" };
  return { ok: true, set: { status: "paid", paidAt: input.now, gatewayRef: input.reference, verifiedBy: input.verifiedBy, updatedAt: input.now } };
}

/** A drive is activatable only once its order is paid. Null means no blocker. */
export function activationBlocker(order: { status: string } | null): string | null {
  if (!order) return "This drive has no order yet";
  if (order.status !== "paid") return "The drive order is not paid";
  return null;
}

export function remainingSlots(order: Pick<DriveOrderLike, "slots" | "issuedCount">): number {
  return Math.max(0, order.slots - order.issuedCount);
}

export function canIssue(order: Pick<DriveOrderLike, "status" | "slots" | "issuedCount">, n: number): boolean {
  return order.status === "paid" && Number.isInteger(n) && n >= 1 && n <= remainingSlots(order);
}
