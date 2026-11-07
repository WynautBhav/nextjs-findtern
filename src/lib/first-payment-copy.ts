// Words for "what the first payment is", one place so the dashboard and the proposal composer cannot drift.
// The rule itself lives in billing-plan.ts / checkout.ts (master 326a1ed2, 98184314): a post-paid hire (score 6+)
// pays the hiring charge plus the Month 1 charge first; each later month falls due 2 days before the pay date.

/** Dashboard "payments due" explainer. Verbatim from master 98184314. */
export const FIRST_PAYMENT_EXPLAINER =
  "An accepted offer becomes a hire once the first payment is made: the hiring charge, plus the Month 1 charge for scores 6 and above. Each later month's charge is due 2 days before the month's pay date; you can pay up to 15 days early.";

/** Composer note. Null below 6 (those hires pay the whole engagement up front) or when the candidate is not scored. */
export function firstPaymentNote(score: number | null | undefined): string | null {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 6) return null;
  return "The first payment is the hiring fee plus the Month 1 charge. Each later month is billed against the timesheets you approve.";
}
