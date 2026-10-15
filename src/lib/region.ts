/**
 * India-region inference for pricing. Zero imports - safe for `node --test`.
 */

export type Region = "IN" | null;

/**
 * Is this employer India-based? Country first (explicit), then the dial
 * code, then the number itself as a last resort.
 *
 * The old code only looked at the national number starting with "91" - but
 * numbers are stored split (`countryCode: "+91"` + national number), so the
 * check never matched and every Indian employer saw dollar prices.
 */
export function employerRegion(input: {
  country?: string | null;
  countryCode?: string | null;
  phoneNumber?: string | null;
}): Region {
  const country = String(input.country ?? "").trim().toLowerCase();
  if (country) {
    return country === "india" || country === "in" || country.includes("india") ? "IN" : null;
  }
  const digits = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "");
  const code = digits(input.countryCode);
  if (code) return code === "91" ? "IN" : null;
  return digits(input.phoneNumber).startsWith("91") ? "IN" : null;
}
