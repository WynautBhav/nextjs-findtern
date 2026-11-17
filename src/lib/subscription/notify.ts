import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { employerNames, notify } from "@/lib/notify";

/** What a receipt says in place of "₹0.00" for a subscription a full-waiver code completed. */
const WAIVED_LABEL = "Complimentary (full waiver)";

/**
 * "Findtern Pro started": the in-app notification and the receipt email, once per order (the dedupe key makes a replay, or the
 * webhook arriving after the callback, a no-op). Called by `settleEmployerOrder` after the row is paid. Never throws into the settlement.
 */
export async function notifySubscriptionStarted(order: { employerId: string; orderId: string; amountMinor: number; currency: string; raw: unknown }, waived: boolean): Promise<void> {
  try {
    const { contact } = await employerNames(order.employerId);
    const days = Number((order.raw as { periodDays?: unknown } | null)?.periodDays);
    await notify({
      to: { type: "employer", id: order.employerId },
      type: "subscription_started",
      title: "Findtern Pro is on",
      message: `Your Findtern Pro subscription${Number.isInteger(days) && days > 0 ? ` (${days} days)` : ""} has started. The CGPA filter and the college filter and sort are unlocked on Candidates.`,
      data: { orderId: order.orderId },
      dedupeKey: `subscription_started_${order.orderId}`,
      email: emails.employerPaymentReceived({
        employerName: contact,
        role: "your Findtern Pro subscription",
        amount: waived ? WAIVED_LABEL : formatMoney(order.amountMinor, order.currency, { zeroLabel: false }),
      }),
    });
  } catch (e) {
    console.error("[payments] subscription_started notification failed", e);
  }
}
