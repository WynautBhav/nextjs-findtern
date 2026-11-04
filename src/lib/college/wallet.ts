import { bonusBand, type BonusBand } from "../completion-bonus.ts";

/** College incentive per completed internship, INR paise, by the score BEFORE the +1 (same bands as the intern bonus). */
export const INCENTIVE_MINOR: Record<BonusBand, number> = { standard: 50000, skilled: 100000, assured: 150000 };

/** What a completion credits the college, or null: only a verified, current member of a partner college earns. */
export function incentivePlan(
  m: { status: string; leftAt: Date | null; isPartner: boolean } | null | undefined,
  scoreBefore: number | null,
): { bandId: BonusBand; amountMinor: number } | null {
  if (!m || m.status !== "verified" || m.leftAt || !m.isPartner) return null;
  const bandId = bonusBand(scoreBefore);
  return { bandId, amountMinor: INCENTIVE_MINOR[bandId] };
}
