import { promoModeProblem } from "./promo-rules.ts";

export type PayMode = "upfront" | "monthly" | "postpaid";

/** The part of a payable line the refusals read. */
export type ModeLine = { due: unknown | null; charge: { monthlyBlocked: string | null } };

export const MONTHLY_AT_START_GONE = "Monthly payment is now made as each month falls due. Refresh the page.";

/**
 * The employer order route's refusals on how this order is paid, pure. Returns
 * the 400 to send, or the mode the order is really paid in: a due month is
 * monthly whatever was asked (dues.ts counts those orders).
 *  - "monthly" (pay-at-start) is gone for a new hire; a stale tab gets a clear refusal.
 *  - "postpaid" is refused for a hire whose score is under 6 or who is full-time.
 *  - a promo code only works when the whole engagement is paid upfront.
 */
export function orderModeProblem(input: { mode: PayMode; paying: readonly ModeLine[]; hasPromo: boolean }):
  | { ok: true; mode: PayMode }
  | { ok: false; status: 400; error: string } {
  const { mode, paying, hasPromo } = input;
  const refuse = (error: string) => ({ ok: false as const, status: 400 as const, error });
  if (mode === "monthly" && paying.some((l) => !l.due)) return refuse(MONTHLY_AT_START_GONE);
  if (mode === "postpaid") {
    const blocked = paying.find((l) => !l.due && l.charge.monthlyBlocked)?.charge.monthlyBlocked;
    if (blocked) return refuse(blocked);
  }
  const effective: PayMode = paying.some((l) => l.due) ? "monthly" : mode;
  if (hasPromo) {
    const problem = promoModeProblem(effective === "upfront" ? "upfront" : "monthly");
    if (problem) return refuse(problem);
  }
  return { ok: true, mode: effective };
}
