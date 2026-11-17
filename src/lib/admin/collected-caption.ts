import { formatMoney } from "../format.ts";

/** The dashboard tile's caption: the window, and when money went back, both parts of the net. Pure. */
export function collectedCaption(m: { collectedGrossWeekMinor: number; refundedWeekMinor: number }): string {
  if (m.refundedWeekMinor <= 0) return "last 7 days, India time";
  const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
  return `${inr(m.collectedGrossWeekMinor)} collected − ${inr(m.refundedWeekMinor)} refunded · last 7 days, India time`;
}
