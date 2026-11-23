import { z } from "zod";

/**
 * Discount rules shared by promo create and edit. Edit sends only the fields that changed, so the
 * check runs on the row as it will be after the edit ({ ...existing, ...sent }).
 */
export type PromoDiscountInput = {
  discountType?: string | null;
  discountValue?: number | null;
  appliesTo?: string | null;
};

/** The promo columns are 32-bit integers: a larger number used to reach the insert and come back as an empty 500. */
const PG_INT_MAX = 2_147_483_647;

/** Zod fields for the promo numbers, shared by create and edit (the whole-number and sign rules, plus the column limit). */
export const promoNumberFields = {
  discountValue: z.number("Enter a discount value").int("Discount must be a whole number").positive("Discount must be greater than 0").max(PG_INT_MAX, "Discount is too large"),
  maxUsages: z.number().int().positive("Max uses must be at least 1").max(PG_INT_MAX, "Max uses is too large"),
  minOrderAmountMinor: z.number().int().min(0, "Minimum order can't be negative").max(PG_INT_MAX, "Minimum order is too large"),
};

/** A reason the discount is not allowed, or null. */
export function promoDiscountProblem({ discountType, discountValue, appliesTo }: PromoDiscountInput): string | null {
  if (discountValue == null || !Number.isFinite(discountValue) || discountValue <= 0) return "Discount must be greater than 0";
  if (discountType === "percentage") {
    if (discountValue > 100) return "A percentage discount can't be more than 100";
    // Employer codes may not cover the stipend; fixed amounts are checked at quote time, when the stipend is known.
    if (discountValue === 100 && appliesTo === "subscription") return "A subscription code can't be 100%. To give a subscription away, create a full-waiver code for the subscription.";
    if (discountValue === 100 && appliesTo !== "intern") return "Only an intern code can be 100%. Employer codes can't cover the whole stipend.";
  }
  return null;
}

/**
 * A 100% code the ordinary form can store is an intern code (its activation settles free). For every other audience a 100% code
 * is a full-waiver code (lib/full-waiver.ts): the one code that may bring a hiring payment or a subscription to zero, which then
 * settles with no gateway order. The admin form hands that choice to the waiver dialog.
 */
export function fullDiscountUsesWaiver({ discountType, discountValue, appliesTo }: PromoDiscountInput): boolean {
  return discountType === "percentage" && discountValue === 100 && appliesTo !== "intern";
}

/** Code text: 3-32 characters, letters, digits, "_" and "-" (stored upper-case). */
export function promoCodeProblem(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (c.length < 3 || c.length > 32) return "Code must be 3 to 32 characters";
  if (!/^[A-Z0-9_-]+$/.test(c)) return "Code can use letters, numbers, - and _ only";
  return null;
}
