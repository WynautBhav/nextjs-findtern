import { GST_RATE } from "../gst.ts";
import type { SubscriptionCharge, SubscriptionState } from "../employer-subscription.ts";
import { formatDate, formatMoney } from "../format.ts";

/**
 * What the employer's Findtern Pro page says about where they stand, pure. Status words are the ones the brief names:
 * None / Active / Expiring in N days / Expired / Revoked. The end date is an India date (the app's one date rule).
 */

export type StatusTone = "paid" | "waiting" | "closed" | "neutral";

export const UNLOCKS = ["CGPA filter", "College filter and sort"] as const;

const DAY_MS = 86_400_000;

export function statusView(state: SubscriptionState): { label: string; tone: StatusTone } {
  switch (state.status) {
    case "active":
      return { label: "Active", tone: "paid" };
    case "expiring":
      return { label: state.daysLeft === 1 ? "Expiring in 1 day" : `Expiring in ${state.daysLeft ?? 0} days`, tone: "waiting" };
    case "expired":
      return { label: "Expired", tone: "closed" };
    case "revoked":
      return { label: "Revoked", tone: "closed" };
    default:
      return { label: "None", tone: "neutral" };
  }
}

/** The line under the status: what the dates mean, or what buying does. */
export function statusLine(state: SubscriptionState): string {
  const ends = state.endsAt ? formatDate(state.endsAt) : null;
  switch (state.status) {
    case "active":
      return "The CGPA filter and the college filter and sort are unlocked on Candidates. Renewing adds days to the end date.";
    case "expiring":
      return "The filters are unlocked on Candidates for now. Renew before the end date to keep them: the new days are added after it.";
    case "expired":
      return `Your access ended on ${ends}. The CGPA filter and the college filter and sort are locked again.`;
    case "revoked":
      return "Findtern ended this access. If you think that is a mistake, contact us. You can buy it again at any time.";
    default:
      return "You have not subscribed yet. The CGPA filter and the college filter and sort on Candidates stay locked until you do.";
  }
}

export function buyLabel(state: SubscriptionState): string {
  return state.active || state.status === "expired" ? "Renew Findtern Pro" : "Buy Findtern Pro";
}

/** What paying now will do to the end date: stacks while active, starts today otherwise. */
export function renewalNote(state: SubscriptionState, durationDays: number): string {
  if (state.active && state.endsAt) {
    const next = formatDate(new Date(Date.parse(state.endsAt) + durationDays * DAY_MS));
    return `Renewing adds ${durationDays} days to your current end date, so none of your remaining days are lost. New end date: ${next}.`;
  }
  return `Access starts as soon as the payment is confirmed and runs for ${durationDays} days from then.`;
}

/**
 * The price said plainly, one wording everywhere (page, upsell card, admin editor): India "₹10,000 + 18% GST (₹11,800)",
 * export "$100 (no GST)". The GST is shown only when the charge carries some, so a zero-GST INR price reads as plain money.
 */
export function chargeLine(charge: SubscriptionCharge, currency: "INR" | "USD"): string {
  if (charge.gstMinor === 0) return currency === "USD" ? `${formatMoney(charge.totalMinor, currency)} (no GST)` : formatMoney(charge.totalMinor, currency);
  return `${formatMoney(charge.baseMinor, currency)} + ${Math.round(GST_RATE * 100)}% GST (${formatMoney(charge.totalMinor, currency)})`;
}
