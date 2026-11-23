import { formatMoney, formatRate, type Currency } from "./format.ts";
import type { FeeDisplay } from "./fee-display.ts";
import { buyerFromEmployer, type LiveEmployerBuyer } from "./invoice-buyer.ts";
import { placeOfSupply, splitGst, type PlaceOfSupply } from "./gst.ts";
import { discountedMonthlyMinor } from "./college/drive-pricing.ts";

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
  key: "rate" | "drive" | "monthly" | "gst" | "fee";
  label: string;
  /** Already formatted for display. */
  value: string;
  /** A waived amount to print struck through, before `value` ("(FREE)"). */
  struck?: string;
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
  /** How to show the hiring fee; wins over `perHireMinor`. Only set where billing's own figure is known (lib/fee-display.ts). */
  fee?: FeeDisplay;
  /** Null when the company's tax place is unknown: the GST line is left out rather than guessed. */
  place: PlaceOfSupply | null;
  /** A campus drive offer: % off the monthly charge (server-decided; lib/college/drive-pricing.ts). */
  driveDiscountPercent?: number;
}): OfferBreakdown {
  const { currency } = input;
  const rate = input.hourlyRateMinor && input.hourlyRateMinor > 0 ? input.hourlyRateMinor : 0;
  const hours = input.hours && input.hours > 0 ? input.hours : 0;
  const drivePct = input.driveDiscountPercent && input.driveDiscountPercent > 0 ? input.driveDiscountPercent : 0;
  const listMinor = Math.round(rate * hours);
  const monthlyMinor =
    input.monthlyMinor != null
      ? input.monthlyMinor
      : input.hourlyRateMinor == null
        ? null
        : drivePct
          ? discountedMonthlyMinor(listMinor, drivePct)
          : listMinor;
  const fee: FeeDisplay =
    input.fee ??
    (input.perHireMinor && input.perHireMinor > 0 ? { kind: "charged", amountMinor: input.perHireMinor } : { kind: "none" });
  const feeMinor = fee.kind === "charged" ? fee.amountMinor : 0;
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
  if (drivePct && monthlyMinor != null && listMinor > monthlyMinor) {
    lines.push({ key: "drive", label: `Campus drive, ${drivePct}% off`, value: `− ${formatMoney(listMinor - monthlyMinor, currency)}`, struck: formatMoney(listMinor, currency) });
  }
  lines.push({
    key: "monthly",
    label: inr && monthlyMinor ? "Monthly (incl. GST)" : "Monthly",
    value: monthlyMinor == null ? "-" : formatMoney(monthlyMinor, currency),
    strong: true,
  });
  if (gstMinor > 0) lines.push({ key: "gst", label: "of which GST", value: formatMoney(gstMinor, currency) });
  if (fee.kind === "charged") {
    lines.push({ key: "fee", label: "Hiring fee, one-time", value: formatMoney(fee.amountMinor, currency) });
  } else if (fee.kind === "free") {
    lines.push({ key: "fee", label: "Hiring fee, one-time", struck: formatMoney(fee.listMinor, currency), value: "(FREE)" });
  }

  return { monthlyMinor, gstMinor, feeMinor, lines };
}
