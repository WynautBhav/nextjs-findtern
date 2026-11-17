import { z } from "zod";

import { SUBSCRIPTION_DEFAULTS, parseSubscriptionConfig, subscriptionPriceMinor, type SubscriptionConfig } from "../employer-subscription.ts";

/**
 * The pure half of saving the Findtern Pro price, length and switch (`PUT /api/admin/pricing`, body
 * `{ employerSubscription: {...} }`): which body it is, whether it is valid, and the audit meta. The route does
 * the permission check, the write and the cache purge around it.
 */

/** Longest subscription an admin can set: three years. (The reader tolerates more; the editor does not offer it.) */
export const SUBSCRIPTION_MAX_DAYS = 1095;
/** Same ceiling the other price fields use (pricing-config MAX_MINOR): Rs 10,00,000. */
export const SUBSCRIPTION_MAX_PRICE_MINOR = 100_000_000;

export const subscriptionConfigBodySchema = z.object({
  employerSubscription: z.object(
    {
      priceInrMinor: z
        .number({ error: "Enter a price in rupees." })
        .int("The price must be a whole number of paise.")
        .min(1, "The price must be above zero.")
        .max(SUBSCRIPTION_MAX_PRICE_MINOR, "That price is too high."),
      durationDays: z
        .number({ error: "Enter the number of days." })
        .int("Days must be a whole number.")
        .min(1, "The subscription must last at least 1 day.")
        .max(SUBSCRIPTION_MAX_DAYS, `The subscription can last ${SUBSCRIPTION_MAX_DAYS} days at most.`),
      enabled: z.boolean({ error: "Choose on or off." }),
    },
    { error: "Something is wrong with this request. Refresh the page and try again." },
  ),
});

export function isSubscriptionConfigBody(body: unknown): boolean {
  return !!body && typeof body === "object" && "employerSubscription" in (body as Record<string, unknown>);
}

export type SubscriptionConfigPut = { ok: true; config: SubscriptionConfig } | { ok: false; error: string };

export function parseSubscriptionConfigPut(body: unknown): SubscriptionConfigPut {
  const r = subscriptionConfigBodySchema.safeParse(body);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid input" };
  return { ok: true, config: r.data.employerSubscription };
}

/** `{from,to}` for each field that moved, plus both whole values; the USD figure is what the rule derives, shown for the reader. */
export function subscriptionConfigAuditMeta(rawBefore: unknown, after: SubscriptionConfig) {
  const before = parseSubscriptionConfig(rawBefore);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["priceInrMinor", "durationDays", "enabled"] as const) {
    if (before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
  }
  return { before, after, changes, usdMinor: { from: subscriptionPriceMinor(before, "USD"), to: subscriptionPriceMinor(after, "USD") } };
}

export { SUBSCRIPTION_DEFAULTS };
