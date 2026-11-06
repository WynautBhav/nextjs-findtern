/**
 * Discount rules shared by promo create and edit. Edit sends only the fields that changed, so the
 * check runs on the row as it will be after the edit ({ ...existing, ...sent }).
 */
export type PromoDiscountInput = {
  discountType?: string | null;
  discountValue?: number | null;
  appliesTo?: string | null;
};

/** A reason the discount is not allowed, or null. */
export function promoDiscountProblem({ discountType, discountValue, appliesTo }: PromoDiscountInput): string | null {
  if (discountValue == null || !Number.isFinite(discountValue) || discountValue <= 0) return "Discount must be greater than 0";
  if (discountType === "percentage") {
    if (discountValue > 100) return "A percentage discount can't be more than 100";
    // Employer codes may not cover the stipend; fixed amounts are checked at quote time, when the stipend is known.
    if (discountValue === 100 && appliesTo !== "intern") return "Only an intern code can be 100%. Employer codes can't cover the whole stipend.";
  }
  return null;
}

/** Code text: 3-32 characters, letters, digits, "_" and "-" (stored upper-case). */
export function promoCodeProblem(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (c.length < 3 || c.length > 32) return "Code must be 3 to 32 characters";
  if (!/^[A-Z0-9_-]+$/.test(c)) return "Code can use letters, numbers, - and _ only";
  return null;
}
