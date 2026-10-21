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

/* ── Display currencies ────────────────────────────────────────────────
 * Findtern bills in INR (India) and USD (everywhere else). A visitor abroad
 * can choose to *see* the USD rate card in their own currency; the amount
 * is converted from the USD figure at the reference rate below, rounded for
 * display, and labelled as a reference - the invoice is still in USD.
 * Rates are per 1 USD, reviewed by hand, deliberately not live: a price
 * that drifts between page loads reads as a bait. */
export const DISPLAY_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SGD: 1.35,
  AUD: 1.52,
  CAD: 1.37,
} as const;

export type DisplayCurrency = keyof typeof DISPLAY_RATES;

/** Every currency a price can be shown in. INR is the authored card; the rest derive from USD. */
export type PriceCurrency = "INR" | DisplayCurrency;

/**
 * What the marketing picker offers: INR or USD only, the two currencies
 * Findtern bills in. A stored choice outside this list (an older EUR pick)
 * fails isPriceCurrency and falls back to the timezone default.
 */
export const PRICE_CURRENCIES: { code: PriceCurrency; label: string }[] = [
  { code: "INR", label: "Indian rupee" },
  { code: "USD", label: "US dollar" },
];

export function isPriceCurrency(value: string): value is PriceCurrency {
  return PRICE_CURRENCIES.some((c) => c.code === value);
}

/** True for a currency shown by converting the USD card (not USD itself). */
export function isConvertedCurrency(c: string): c is Exclude<DisplayCurrency, "USD"> {
  return c !== "USD" && c in DISPLAY_RATES;
}
