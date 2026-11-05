import { billingPlanOf, istDay, PAY_WINDOW_DAYS, postpaidAnchor, postpaidDueOn, postpaidMonthsPaid, type PlanOrder } from "./billing-plan.ts";
import { lineCharge } from "./checkout.ts";
import { emails } from "./emails.ts";
import { formatDate, formatMoney } from "./format.ts";
import { monthsOf, parseOffer } from "./offer.ts";

/** Stipend reminders for post-paid hires, counted back from the employer due day (2 days before the intern is paid) (plan "postpaid", fixed when the hire was paid; the current score is not looked at). One per hire, month and type. */
export type ReminderType = "upcoming" | "due" | "overdue";
/** `offset`: days from the due day of the stage sent (-15..0 before/on it; 3 for overdue). */
export type Reminder = { k: number; type: ReminderType; offset: number; dueOn: string; dueToday: boolean; amountMinor: number; currency: string };

/** The reminder mail: the due day reads "8 Nov 2026" (IST) and the amount "₹16,000", never the stored 2026-11-08 or raw paise. */
export function reminderEmail(r: Reminder, who: { name: string; intern: string }) {
  return emails.paymentReminder({ name: who.name, type: r.type, k: r.k, amount: formatMoney(r.amountMinor, r.currency), dueOn: formatDate(r.dueOn), dueToday: r.dueToday, intern: who.intern });
}

/** The intern is told their stipend waits on the employer only once the month is due or overdue, not during the employer's early pay window. */
export const internNoticeDue = (r: Pick<Reminder, "type">) => r.type !== "upcoming";

/** Reminders start this many days before the due day: the same day the month becomes payable. */
export const REMINDER_LEAD_DAYS = PAY_WINDOW_DAYS;
/** Days before (negative) or on (0) the due day that a reminder goes out: every 3 days, then daily for the last 3. */
export const REMINDER_OFFSETS = [-15, -12, -9, -6, -3, -2, -1, 0] as const;
/** The due day and the 2 days after it read "due"; from this many days after, "overdue" (sent once). */
export const OVERDUE_AFTER_DAYS = 3;
/** One key per hire, month and send day, so a cron re-run on the same day never mails twice. "due"/"overdue" keep their pre-W6 keys. */
export const reminderKey = (proposalId: string, k: number, type: ReminderType, offset?: number) =>
  type === "upcoming" ? `payment_reminder:${proposalId}:${k}:upcoming:${offset}` : `payment_reminder:${proposalId}:${k}:${type}`;

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
  // The latest scheduled stage reached today: a missed cron day catches up with one email, never a burst.
  const day = Math.round((Date.parse(`${todayIst}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  const offset = day >= OVERDUE_AFTER_DAYS ? OVERDUE_AFTER_DAYS : day >= 0 ? 0 : [...REMINDER_OFFSETS].reverse().find((o) => o <= day);
  if (offset === undefined) return null;
  const type: ReminderType = offset === OVERDUE_AFTER_DAYS ? "overdue" : offset === 0 ? "due" : "upcoming";
  if (sent.has(reminderKey(hire.id, k, type, offset))) return null;
  // A post-paid month is the stipend alone (as invoice-lines prices it); a later score change must not drop the reminder.
  const amountMinor = lineCharge(offer, 10, "postpaid", { firstPayment: false }).totalMinor;
  return amountMinor > 0 ? { k, type, offset, dueOn, dueToday: todayIst === dueOn, amountMinor, currency: offer.currency } : null; // nothing to pay, nothing to chase
}

export { istDay };
