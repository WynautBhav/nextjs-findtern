/**
 * Promo code rules, pure - no DB, safe for `node --test`.
 *
 * Units, as the admin form writes them: a fixed `discountValue` and
 * `minOrderAmountMinor` are both paise (the form multiplies rupees by 100). A USD order converts both at the
 * same ₹100 = $1 rule as every price, so one code works for both regions.
 */
import { inrMinorToUsdMinor } from "./currency.ts";

export type PromoRow = {
  code: string;
  discountType: string;
  discountValue: number;
  maxUsages: number | null;
  usedCount: number;
  minOrderAmountMinor: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
};

type Currency = "INR" | "USD";

export type PromoAudience = "intern" | "employer";
export const PROMO_APPLIES_TO = ["intern", "employer", "both"] as const;
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO)[number];

/** Why a code cannot be redeemed by this kind of account, or null. */
export function promoAudienceProblem(appliesTo: string | null | undefined, audience: PromoAudience): string | null {
  const scope = appliesTo ?? "both";
  if (scope === "both" || scope === audience) return null;
  return audience === "employer" ? "This code is for interns only" : "This code is for companies only";
}

/** Admin input: the window must not end before it starts. */
export function promoWindowProblem(validFrom: Date | null, validUntil: Date | null): string | null {
  if (validFrom && validUntil && validUntil < validFrom) return "The end date must be on or after the start date";
  return null;
}

function inCurrency(inrMinor: number, currency: Currency): number {
  return currency === "USD" ? inrMinorToUsdMinor(inrMinor) : inrMinor;
}

/** Why this code cannot be used on this order, or null when it can. */
export function promoProblem(
  row: PromoRow,
  orderMinor: number,
  currency: Currency,
  now: Date = new Date(),
): string | null {
  if (!row.isActive) return "Invalid promo code";
  if (row.validFrom && row.validFrom > now) return "Promo code is not active yet";
  if (row.validUntil && row.validUntil < now) return "Promo code expired";
  if (row.maxUsages && row.usedCount >= row.maxUsages) return "Promo code exhausted";
  if (row.minOrderAmountMinor && orderMinor < inCurrency(row.minOrderAmountMinor, currency)) {
    return "Promo code does not apply to this order";
  }
  return null;
}

/** Discount in the order's minor units, never more than the order itself. */
export function promoDiscount(row: PromoRow, orderMinor: number, currency: Currency): number {
  const raw =
    row.discountType === "percentage"
      ? Math.floor((orderMinor * Math.min(row.discountValue, 100)) / 100) // legacy rounds down
      : inCurrency(row.discountValue, currency); // fixed: paise, as the legacy app stores it
  return Math.max(0, Math.min(raw, orderMinor));
}
