import type { InvoiceLine } from "./invoice.ts";
import { lineCharge } from "./checkout.ts";
import { engagementPeriods } from "./employer-timesheets.ts";
import type { Offer } from "./offer.ts";
import { formatMoney } from "./format.ts";

/** "Dec 2026" for the calendar month `offset` months after the start date; null without a start date. */
export function monthName(startDate: string | null, offset: number): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(startDate ?? ""));
  if (!m) return null;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + offset, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(at);
}

/**
 * The invoice lines for one hire on one payment. The one-time hiring fee and
 * the stipend are separate lines (bug sheet 2 Nov), and a monthly instalment
 * says which month it pays. `paymentIndex` is how many payments for this hire
 * settled before this one: 0 is the first, which is the only one that carries
 * the hiring fee. `chargedMinor` is what the order was actually charged for
 * this hire when known (it may be net of a promo); the fee is never discounted,
 * so the stipend line takes the difference.
 */
export function hireInvoiceLines(input: {
  who: string;
  roleTitle: string;
  projectName: string;
  offer: Offer;
  monthly: boolean;
  paymentIndex: number;
  chargedMinor?: number | null;
  /** Post-paid hire (billing-plan.ts): "fee" = the first payment, the hiring charge alone; a number k = stipend month k, no fee. */
  postpaid?: "fee" | number;
}): InvoiceLine[] {
  const { roleTitle, projectName, offer, monthly, paymentIndex } = input;
  // A nameless or deleted candidate still reads "Candidate — Designer", never "— Designer".
  const who = input.who.trim() || "Candidate";
  if (input.postpaid === "fee") {
    const fee = lineCharge(offer, 10, "postpaid").perHireMinor;
    return [
      {
        label: `${who} — Hiring charge`,
        detail: `${projectName} · One-time hiring charge; each month's stipend is due 2 days before the intern's pay day`,
        amountMinor: input.chargedMinor != null && input.chargedMinor > 0 ? input.chargedMinor : fee,
      },
    ];
  }
  if (typeof input.postpaid === "number") {
    const k = input.postpaid;
    const p = offer.startDate ? engagementPeriods(offer.startDate, offer.months)[k - 1] : undefined;
    const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)).replace("Sept", "Sep");
    const listed = lineCharge(offer, 10, "postpaid", { firstPayment: false }).totalMinor;
    return [
      {
        label: `${who} — ${roleTitle || projectName}`,
        detail: `${offer.months}m · ${projectName} · Stipend, Month ${k} of ${offer.months}${p ? ` (${day(p.start)} – ${day(p.end)})` : ""}`,
        amountMinor: input.chargedMinor != null && input.chargedMinor > 0 ? input.chargedMinor : listed,
      },
    ];
  }
  const first = paymentIndex === 0;
  // Score 10: the mode was already allowed when the order was made.
  const charge = lineCharge(offer, 10, monthly ? "monthly" : "upfront", { firstPayment: first });
  const feeMinor = charge.perHireMinor;
  const listed = charge.baseMinor - feeMinor;
  // Below the fee only happens in free mode: fall back to the list price (never `>= 0`, that would print a negative stipend).
  const stipendMinor =
    input.chargedMinor != null && input.chargedMinor >= feeMinor ? input.chargedMinor - feeMinor : listed;

  const from = monthly ? paymentIndex : 0;
  const firstMonth = monthName(offer.startDate, from);
  const lastMonth = monthName(offer.startDate, offer.months - 1);
  const period = monthly
    ? `Month ${paymentIndex + 1} of ${offer.months}${firstMonth ? ` (${firstMonth})` : ""}`
    : offer.months === 1
      ? `1 month${firstMonth ? ` (${firstMonth})` : ""}, paid in full`
      : `${offer.months} months${firstMonth && lastMonth ? ` (${firstMonth} to ${lastMonth})` : ""}, paid in full`;

  const lines: InvoiceLine[] = [
    {
      label: `${who} — ${roleTitle || projectName}`,
      // "2m" first, as on the reference invoice: how long the internship runs.
      detail: `${offer.months}m · ${projectName} · Stipend, ${period}`,
      amountMinor: stipendMinor, // 0 prints as ₹0.00, never "Included"
    },
  ];
  if (feeMinor > 0) {
    lines.push({
      label: `${who} — One-time hiring fee`,
      detail: `${projectName} · ${formatMoney(feeMinor, offer.currency, { zeroLabel: false })}, charged once with the first payment`,
      amountMinor: feeMinor,
    });
  }
  return lines;
}
