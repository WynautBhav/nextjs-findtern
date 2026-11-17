/**
 * Which kind of payment a promo code may discount, pure.
 *
 * `promo_codes.applies_to` is free text: "intern" (activation), "employer" (hiring), "both" (those two) and, for the
 * Findtern Pro subscription, "subscription". Conservative on purpose: a code made for hiring never discounts the
 * subscription, and a subscription code never discounts a hire or an activation.
 */

export type PromoAudience = "intern" | "employer" | "subscription";
export const PROMO_APPLIES_TO = ["intern", "employer", "both", "subscription"] as const;
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO)[number];

/** May a code with this scope (null/missing reads as "both") be used on this kind of payment? */
export function scopeAllows(appliesTo: string | null | undefined, audience: PromoAudience): boolean {
  const scope = appliesTo ?? "both";
  if (audience === "subscription") return scope === "subscription";
  return scope === "both" || scope === audience;
}

/** Why a code cannot be used on this kind of payment (hiring, activation or the Findtern Pro subscription), or null. */
export function promoAudienceProblem(appliesTo: string | null | undefined, audience: PromoAudience): string | null {
  if (scopeAllows(appliesTo, audience)) return null;
  if (audience === "subscription") return "This code is for hiring payments, not the Findtern Pro subscription";
  if ((appliesTo ?? "both") === "subscription") return "This code is only for the Findtern Pro subscription";
  return audience === "employer" ? "This code is for interns only" : "This code is for companies only";
}
