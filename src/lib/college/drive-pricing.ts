/**
 * Campus drive pricing and the drive's countdown. Pure: no I/O, so the routes, the pages and the tests share one rule.
 *
 * An offer sent from a campus drive (the employer is inside a live drive and the student is one of its students) is
 * stamped by the SERVER with the drive's terms, and keeps them for good, after the drive ends or the company exits:
 *  - 15% off the internship's monthly charges. The one-time hiring fee (₹5,000 below score 6) is never discounted. The
 *    10% off for paying 3+ months upfront still applies on top, and a promo code after that.
 *  - A 1% full-time / PPO fee instead of 8.33% of the annual CTC, also when the intern is converted later.
 * An offer from the open marketplace is standard: no discount, 8.33%. Nothing here is ever read from a request body.
 */

export const DRIVE_DISCOUNT_PERCENT = 15;
export const DRIVE_PPO_FEE_PERCENT = 1;
export const STANDARD_PPO_FEE_PERCENT = 8.33;

export type PricingTier = "virtual_drive" | "standard";

export type HireFees = {
  driveId: string | null;
  pricingTier: PricingTier;
  /** Off the internship's monthly charges only. */
  discountPercent: number;
  /** The full-time / PPO fee, % of the annual CTC. */
  ppoFeePercent: number;
};

/** The terms an offer carries, from where it was sourced alone (its drive id, decided by the server). */
export function calculateHireFees(record: { driveId: string | null | undefined }): HireFees {
  return record.driveId
    ? { driveId: record.driveId, pricingTier: "virtual_drive", discountPercent: DRIVE_DISCOUNT_PERCENT, ppoFeePercent: DRIVE_PPO_FEE_PERCENT }
    : { driveId: null, pricingTier: "standard", discountPercent: 0, ppoFeePercent: STANDARD_PPO_FEE_PERCENT };
}

/** A monthly charge after the drive discount, in minor units, rounded to the paisa. */
export function discountedMonthlyMinor(listMonthlyMinor: number, discountPercent: number): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return Math.round((listMonthlyMinor * (100 - pct)) / 100);
}

/** The full-time fee as a rate (0.01 / 0.0833) from a stored percent; anything odd reads as the standard rate. */
export function ppoRate(ppoFeePercent: number | string | null | undefined): number {
  const n = typeof ppoFeePercent === "string" ? Number(ppoFeePercent) : ppoFeePercent;
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < STANDARD_PPO_FEE_PERCENT ? Math.round(n * 100) / 10_000 : STANDARD_PPO_FEE_PERCENT / 100;
}

const DAY_MS = 86_400_000;
/** The ending-soon notice shows in the drive's last three days. */
export const EXPIRY_WARNING_DAYS = 3;

/** Whole days left in a drive (a part day counts as one) and whether the ending-soon notice shows. Server time decides. */
export function driveCountdown(endsAt: Date, now: Date = new Date()): { daysRemaining: number; showExpiryWarning: boolean; ended: boolean } {
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return { daysRemaining: 0, showExpiryWarning: false, ended: true };
  return { daysRemaining: Math.ceil(left / DAY_MS), showExpiryWarning: left <= EXPIRY_WARNING_DAYS * DAY_MS, ended: false };
}
