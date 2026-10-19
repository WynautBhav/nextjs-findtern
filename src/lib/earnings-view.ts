/**
 * Which stipend screen an intern sees. The empty "No stipend yet" scene is
 * only for someone with no engagement at all: a hired intern whose first
 * payout has not been recorded yet still has a rate and money to come, and
 * used to be told their stipend had not started.
 */
export function earningsView(payoutCount: number, hasEngagement: boolean): "empty" | "summary" {
  return payoutCount === 0 && !hasEngagement ? "empty" : "summary";
}
