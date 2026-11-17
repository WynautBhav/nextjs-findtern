import type { SubscriptionState } from "../employer-subscription.ts";
import { formatDate } from "../format.ts";

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
    case "expiring":
      return `Your access runs until ${ends} (India time).`;
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
export function renewalNote(state: SubscriptionState, durationDays: number, now: Date = new Date()): string {
  if (state.active && state.endsAt) {
    const next = formatDate(new Date(Date.parse(state.endsAt) + durationDays * DAY_MS));
    return `Renewing adds ${durationDays} days to your current end date, so none of your remaining days are lost. New end date: ${next}.`;
  }
  const next = formatDate(new Date(now.getTime() + durationDays * DAY_MS));
  return `Access starts as soon as the payment is confirmed and runs for ${durationDays} days, until ${next}.`;
}
