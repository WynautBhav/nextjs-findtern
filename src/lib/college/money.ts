import { bankProblem } from "../onboarding.ts";

/**
 * College money rules, pure so the routes, the pages and the tests share one
 * answer. Amounts are paise (minor units), like every other money column.
 */

/** Fixed price of one seat: ₹800, GST-inclusive (owner answer Q4). Admin chooses only the seat count. */
export const SEAT_PRICE_MINOR = 80000;

export const MAX_SEATS_PER_BATCH = 5000;

/** Null when `seats` is a whole number from 1 to 5000; otherwise the reason. */
export function seatBatchProblem(seats: unknown): string | null {
  if (typeof seats !== "number" || !Number.isInteger(seats)) return "Seats must be a whole number.";
  if (seats < 1) return "Seats must be at least 1.";
  if (seats > MAX_SEATS_PER_BATCH) return `A batch can hold at most ${MAX_SEATS_PER_BATCH} seats.`;
  return null;
}

/** What a batch costs, GST included. Call `seatBatchProblem` first. */
export function seatBatchAmount(seats: number): number {
  return seats * SEAT_PRICE_MINOR;
}

/**
 * The TPO code's seat cap after a batch is marked paid (owner answer Q1: no free
 * seats, so a new college starts at 0 and the cap is its total paid seats).
 * `max` leaves a cap an admin set higher by hand, or that predates this rule,
 * untouched; it never lowers one.
 */
export function capAfterPaid(input: { cap: number | null | undefined; paidSeatsBefore: number; seats: number }): number {
  return Math.max(input.cap ?? 0, input.paidSeatsBefore + input.seats);
}

/** Wallet balance minus the open withdrawal request, never below 0. */
export function availableMinor(balanceMinor: number, openRequestMinor: number): number {
  return Math.max(0, balanceMinor - openRequestMinor);
}

/**
 * Null when a withdrawal of `amountMinor` may be marked paid against a wallet that holds `balanceMinor` right now
 * (the request holds no money, so the balance can have dropped since it was made); otherwise the reason.
 */
export function settleProblem(balanceMinor: number, amountMinor: number): string | null {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return "Nothing to pay on this request.";
  if (amountMinor > balanceMinor) return `The wallet holds ${balanceMinor} paise now, less than this request (${amountMinor}). Reject it, or wait for more credits.`;
  return null;
}

/** Null when a withdrawal of `amountMinor` may be requested; otherwise the reason. */
export function withdrawalProblem(input: { amountMinor: unknown; availableMinor: number; hasBank: boolean }): string | null {
  const { amountMinor } = input;
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor)) return "Enter a valid amount.";
  if (amountMinor <= 0) return "Enter an amount above zero.";
  if (!input.hasBank) return "Add your bank account before requesting a payout.";
  if (amountMinor > input.availableMinor) return "That is more than your available balance.";
  return null;
}

export type CollegeBankInput = {
  holder?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  upi?: string;
};

/** The student bank rules, applied to the college's field names. Null when valid. */
export function collegeBankProblem(input: CollegeBankInput): string | null {
  return bankProblem({
    accountHolderName: input.holder ?? "",
    bankName: input.bankName ?? "",
    accountNumber: input.accountNumber ?? "",
    ifscCode: input.ifsc ?? "",
    upiId: input.upi ?? "",
  });
}
