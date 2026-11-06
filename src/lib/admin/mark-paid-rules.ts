/**
 * Rules for "mark activation paid" (an off-platform payment recorded by hand).
 * Money moves a candidate into the paid state and fires the invoice, so: only a
 * candidate account, never ₹0 (a college-waived activation comes from the code,
 * not this button), and a reason whenever the amount is not the standard fee.
 */
export const MIN_REASON_CHARS = 5;

export function markPaidProblem(input: { role: string | null | undefined; amountMinor: number; feeMinor: number; reason?: string | null }): string | null {
  if (input.role !== "intern") return "Only a candidate's activation fee can be marked paid here";
  if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) return "Amount must be more than ₹0";
  if (input.amountMinor !== input.feeMinor && String(input.reason ?? "").trim().length < MIN_REASON_CHARS) {
    return `Give a reason (at least ${MIN_REASON_CHARS} characters) when the amount is not the standard activation fee`;
  }
  return null;
}
