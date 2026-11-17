import { PRICING_DEFAULTS, bandMoneyFor, type BandId, type PricingConfig } from "./pricing-config.ts";

/**
 * How the one-time hiring fee is shown (feedback sheet 2, row 6).
 *
 * Pure, and fed only the amount billing itself decided (`chargedMinor`, from
 * lib/checkout.ts under the live per-band setting in lib/per-hire-fee.ts), so
 * the screen can never say FREE where a charge still applies:
 *
 *  - charged: the plain amount;
 *  - free:    the list amount struck through, with "(FREE)" beside it
 *             (the rate card's fee: 5,000 for INR, $50 for USD by default);
 *  - none:    no hiring fee applies at all (full-time offer, a later month of a
 *             running placement, or a hire already settled): nothing is shown.
 */
export type FeeDisplay =
  | { kind: "charged"; amountMinor: number }
  | { kind: "free"; listMinor: number }
  | { kind: "none" };

export function feeDisplay(input: {
  currency: "INR" | "USD";
  /** The fee billing charges now, minor units; 0 when the band is free. */
  chargedMinor: number;
  /** The amount when the band is charged (rate card); falls back to the pricing config's fee for `band`. */
  listMinor?: number | null;
  /** Where `listMinor` is missing: the config's fee (defaults to the published one) for this band (defaults to Espresso). */
  config?: PricingConfig;
  band?: BandId;
  /** False where no hiring fee exists for this view. */
  applicable?: boolean;
}): FeeDisplay {
  if (input.applicable === false) return { kind: "none" };
  if (input.chargedMinor > 0) return { kind: "charged", amountMinor: input.chargedMinor };
  const list = input.listMinor && input.listMinor > 0
    ? input.listMinor
    : bandMoneyFor(input.config ?? PRICING_DEFAULTS, input.band ?? "standard", input.currency).hireFeeListMinor;
  return { kind: "free", listMinor: list };
}
