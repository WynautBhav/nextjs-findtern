/**
 * The hire strip's steps and which one a page lights up. Pure, so it is
 * testable (node --test cannot import the .tsx strip).
 */

export type FlowStepKey = "candidates" | "shortlisted" | "awaitingReply" | "toPay" | "hired";

/** The pages that carry the strip. `null` shows it with no step lit. */
export type FlowPage = "candidates" | "cart" | "proposals" | "checkout";

const STEP_FOR_PAGE: Record<FlowPage, FlowStepKey> = {
  candidates: "candidates",
  cart: "shortlisted",
  proposals: "awaitingReply",
  checkout: "toPay",
};

export function currentStepKey(current: FlowPage | null): FlowStepKey | null {
  return current ? STEP_FOR_PAGE[current] : null;
}
