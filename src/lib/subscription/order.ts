import { isSubscriptionOrderRaw } from "../employer-subscription.ts";
import { employerRegion } from "../region.ts";

/**
 * The Findtern Pro subscription as an `employer_payments` row, pure: what its `raw` holds, which currency it is
 * charged in, what its invoice line says. No proposal ids anywhere: the settlement hires nobody for it.
 */

export type SubscriptionCurrency = "INR" | "USD";

/** Same rule the hiring checkout uses: an employer in India pays INR, everyone else USD. The client never chooses. */
export function subscriptionCurrency(employer: { country?: string | null; countryCode?: string | null; phoneNumber?: string | null }): SubscriptionCurrency {
  return employerRegion(employer) === "IN" ? "INR" : "USD";
}

/** "Findtern Pro subscription (365 days)": the one invoice line, whatever the length. */
export function subscriptionLineLabel(periodDays: number): string {
  return `Findtern Pro subscription (${periodDays} ${periodDays === 1 ? "day" : "days"})`;
}

/**
 * Same notes shape the hiring order writes (legacy admin reads `raw.order.notes`), with an empty `proposalIds`
 * so every hire-related reader sees "no proposals". `periodDays` is frozen here: a later change of the configured
 * length never alters what a paid order bought.
 */
export function subscriptionNotes(i: { employerId: string; periodDays: number; listMinor: number; amountMinor: number; discountMinor: number; computedAmountMinor?: number; listBaseMinor?: number; listGstMinor?: number }) {
  return {
    employerId: i.employerId,
    purpose: "employer_subscription",
    proposalIds: [] as string[],
    periodDays: i.periodDays,
    computedAmountMinor: i.computedAmountMinor ?? i.amountMinor,
    listAmountMinor: i.listMinor,
    discountAmountMinor: i.discountMinor,
    // `listAmountMinor` is the GST-inclusive total; these two say what it is made of (price excluding GST, and the GST on it).
    ...(i.listBaseMinor !== undefined ? { listBaseAmountMinor: i.listBaseMinor, listGstAmountMinor: i.listGstMinor ?? 0 } : {}),
  };
}

/** The top-level markers the entitlement reader and every report key on. */
export function subscriptionRawBase(i: { periodDays: number; currency: SubscriptionCurrency }) {
  return { kind: "employer_subscription" as const, periodDays: i.periodDays, currency: i.currency };
}

/**
 * Is the order this raw describes an open, reusable subscription order for this code (null = no code), currency and
 * amount? An order opened at another amount (before a price or GST change) is never reused, so nobody pays the old
 * amount against the new terms; the route closes it and opens a new one.
 */
export function reusableOpenOrder(
  rows: { orderId: string; status: string; createdAt: Date | null; amountMinor: number; currency: string; gateway?: string | null; raw: unknown }[],
  want: { promoCode: string | null; currency: SubscriptionCurrency; amountMinor: number; now: Date; openMinutes: number },
): { orderId: string; amountMinor: number; currency: string } | null {
  const since = want.now.getTime() - want.openMinutes * 60_000;
  for (const r of rows) {
    if (r.status !== "created" || !r.createdAt || r.createdAt.getTime() < since) continue;
    if (!isSubscriptionOrderRaw(r.raw) || r.currency !== want.currency || r.amountMinor !== want.amountMinor) continue;
    // A waiver order settles inside the request that makes it; one left "created" is a failure, never reused.
    if (r.gateway === "promo_full_waiver" || r.gateway === "free" || r.gateway === "test") continue;
    const code = ((r.raw as { promo?: { promoCode?: string } }).promo?.promoCode ?? null)?.toUpperCase() ?? null;
    if (code !== (want.promoCode?.toUpperCase() ?? null)) continue;
    return { orderId: r.orderId, amountMinor: r.amountMinor, currency: r.currency };
  }
  return null;
}
