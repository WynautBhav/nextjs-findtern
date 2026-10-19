import { INR_PER_USD } from "../currency.ts";

/**
 * Minor units in INR, converting USD at the business rate (₹100 = $1).
 * Client-safe (no DB import), so admin totals on both sides agree and never
 * add dollars to rupees raw.
 */
export function toInrMinor(amountMinor: number | null | undefined, currency: string | null | undefined): number {
  const n = Number(amountMinor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return String(currency ?? "INR").toUpperCase() === "USD" ? n * INR_PER_USD : n;
}
