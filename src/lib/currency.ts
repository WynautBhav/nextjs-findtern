/**
 * INR → USD, the business rule.
 *
 * Not a live exchange rate, on purpose: ₹100 = $1 flat. The market rate sits
 * close to it, Indian prices carry 18% GST that export prices do not, and a
 * fixed rule keeps the USD card on clean whole numbers that never drift
 * between page loads. Every USD figure on the site is derived through here
 * from the authored INR figure, so the two rate cards cannot disagree.
 */

export const INR_PER_USD = 100;

/** Paise → cents. ₹100/hr (10000 paise) → $1/hr (100 cents). */
export function inrMinorToUsdMinor(paise: number): number {
  return Math.round(paise / INR_PER_USD);
}

/** Rupees → dollars, for authored whole-rupee figures. */
export function inrToUsd(rupees: number): number {
  return Math.round(rupees / INR_PER_USD);
}

/** "Save 33%" from a was/now pair; null when there is nothing to show. */
export function savingsPercent(nowMinor: number, wasMinor: number | null | undefined): number | null {
  if (!wasMinor || wasMinor <= nowMinor) return null;
  return Math.round(((wasMinor - nowMinor) / wasMinor) * 100);
}
