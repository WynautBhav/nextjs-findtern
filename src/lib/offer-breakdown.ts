import { formatMoney, formatRate, type Currency } from "./format.ts";
import { buyerFromEmployer, type LiveEmployerBuyer } from "./invoice-buyer.ts";
import { placeOfSupply, splitGst, type PlaceOfSupply } from "./gst.ts";

/**
 * The money lines of an offer, worked out once: rate × hours, the monthly
 * amount, how much of it is GST, and the one-time hiring fee. Pure, so the
 * composer, the offer editor and the proposal page all show the same sum.
 *
 * Rates are GST-inclusive: GST is backed out of the monthly amount (`splitGst`),
 * never added on top. USD orders are exports and carry no GST. All figures are
 * minor units.
 */

export type BreakdownLine = {
  key: "rate" | "monthly" | "gst" | "fee";
  label: string;
  /** Already formatted for display. */
  value: string;
  strong?: boolean;
};

export type OfferBreakdown = {
  monthlyMinor: number | null;
  /** The GST inside the monthly amount; 0 when none applies. */
  gstMinor: number;
  feeMinor: number;
  lines: BreakdownLine[];
};

/** Where the company is taxed, from its billing profile. Null when it cannot be read. */
export function offerPlace(employer: LiveEmployerBuyer | null | undefined, currency: Currency): PlaceOfSupply | null {
  return employer ? placeOfSupply({ ...buyerFromEmployer(employer), currency }) : null;
}

export function offerBreakdown(input: {
  currency: Currency;
  hourlyRateMinor: number | null | undefined;
  hours: number | null | undefined;
  /** The monthly amount as stored on a sent offer; worked out from rate × hours when absent. */
  monthlyMinor?: number | null;
  perHireMinor?: number | null;
  /** Null when the company's tax place is unknown: the GST line is left out rather than guessed. */
  place: PlaceOfSupply | null;
}): OfferBreakdown {
  const { currency } = input;
  const rate = input.hourlyRateMinor && input.hourlyRateMinor > 0 ? input.hourlyRateMinor : 0;
  const hours = input.hours && input.hours > 0 ? input.hours : 0;
  const monthlyMinor =
    input.monthlyMinor != null
      ? input.monthlyMinor
      : input.hourlyRateMinor == null
        ? null
        : Math.round(rate * hours);
  const feeMinor = input.perHireMinor && input.perHireMinor > 0 ? input.perHireMinor : 0;
  const inr = currency.toUpperCase() === "INR";

  let gstMinor = 0;
  if (inr && input.place && monthlyMinor && monthlyMinor > 0) {
    const split = splitGst(monthlyMinor, input.place);
    gstMinor = split.totalMinor - split.baseMinor;
  }

  const lines: BreakdownLine[] = [];
  if (rate > 0 && hours > 0) {
    lines.push({ key: "rate", label: "Rate × hours", value: `${formatRate(rate, currency)} × ${+hours.toFixed(2)} h` });
  }
  lines.push({
    key: "monthly",
    label: inr && monthlyMinor ? "Monthly (incl. GST)" : "Monthly",
    value: monthlyMinor == null ? "-" : formatMoney(monthlyMinor, currency),
    strong: true,
  });
  if (gstMinor > 0) lines.push({ key: "gst", label: "of which GST", value: formatMoney(gstMinor, currency) });
  if (feeMinor > 0) lines.push({ key: "fee", label: "Hiring fee, one-time", value: formatMoney(feeMinor, currency) });

  return { monthlyMinor, gstMinor, feeMinor, lines };
}
