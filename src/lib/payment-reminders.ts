import { billingPlanOf, istDay, postpaidAnchor, postpaidDueOn, postpaidMonthsPaid, type PlanOrder } from "./billing-plan.ts";
import { lineCharge } from "./checkout.ts";
import { monthsOf, parseOffer } from "./offer.ts";

/** Month-end stipend reminders for post-paid hires (plan "postpaid", fixed when the hire was paid; the current score is not looked at). One per hire, month and type. */
export type ReminderType = "upcoming" | "due" | "overdue";
export type Reminder = { k: number; type: ReminderType; dueOn: string; dueToday: boolean; amountMinor: number; currency: string };

export const REMINDER_LEAD_DAYS = 3;
export const reminderKey = (proposalId: string, k: number, type: ReminderType) => `payment_reminder:${proposalId}:${k}:${type}`;

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The reminder to send today for a hire, or null. Only the furthest stage reached is returned, and only if its
 * key is not in `sent`, so a missed cron day catches up with one email, never a burst.
 * `todayIst` is the Indian calendar day (use istDay(new Date())).
 */
export function reminderDue(
  hire: { id: string; status: string; offerDetails: unknown; hiredAt?: Date | string | null; currency?: string | null },
  orders: readonly PlanOrder[],
  sent: ReadonlySet<string>,
  todayIst: string,
): Reminder | null {
  if (hire.status !== "hired" || billingPlanOf(hire.id, orders) !== "postpaid") return null;
  const offer = parseOffer(hire.offerDetails, hire.currency);
  const months = monthsOf(offer.duration);
  const k = postpaidMonthsPaid(hire.id, orders) + 1;
  const dueOn = postpaidDueOn(postpaidAnchor(offer.startDate, hire.hiredAt), months, k);
  if (!dueOn) return null;
  const type: ReminderType | null =
    todayIst >= shift(dueOn, REMINDER_LEAD_DAYS) ? "overdue" : todayIst >= dueOn ? "due" : todayIst >= shift(dueOn, -REMINDER_LEAD_DAYS) ? "upcoming" : null;
  if (!type || sent.has(reminderKey(hire.id, k, type))) return null;
  // A post-paid month is the stipend alone (as invoice-lines prices it); a later score change must not drop the reminder.
  const amountMinor = lineCharge(offer, 10, "postpaid", { firstPayment: false }).totalMinor;
  return amountMinor > 0 ? { k, type, dueOn, dueToday: todayIst === dueOn, amountMinor, currency: offer.currency } : null; // nothing to pay, nothing to chase
}

export { istDay };
