import { inrMinorToUsdMinor } from "../currency.ts";
import { parseRupees, toRupees } from "../admin/pricing-draft.ts";
import type { SubscriptionConfig } from "../employer-subscription.ts";
import { SUBSCRIPTION_MAX_DAYS, SUBSCRIPTION_MAX_PRICE_MINOR } from "./config-put.ts";

/** The Findtern Pro block of the pricing editor, as the form holds it: text in the inputs, a real boolean for the switch. */
export type SubscriptionDraft = { price: string; days: string; enabled: boolean };

export const draftFromConfig = (c: SubscriptionConfig): SubscriptionDraft => ({ price: toRupees(c.priceInrMinor), days: String(c.durationDays), enabled: c.enabled });

export type DraftCheck = { ok: true; config: SubscriptionConfig } | { ok: false; field: "price" | "days"; message: string };

/** What the server would refuse, said before it is asked; the config it would be sent when valid. */
export function validateSubscriptionDraft(d: SubscriptionDraft): DraftCheck {
  const priceMinor = parseRupees(d.price);
  if (priceMinor === null) return { ok: false, field: "price", message: "Enter a price in rupees, like 10000 or 9999.50." };
  if (priceMinor <= 0) return { ok: false, field: "price", message: "The price must be above zero." };
  if (priceMinor > SUBSCRIPTION_MAX_PRICE_MINOR) return { ok: false, field: "price", message: "That price is too high." };
  const t = d.days.trim();
  if (!/^\d+$/.test(t)) return { ok: false, field: "days", message: "Enter the number of days as a whole number." };
  const days = Number(t);
  if (days < 1) return { ok: false, field: "days", message: "The subscription must last at least 1 day." };
  if (days > SUBSCRIPTION_MAX_DAYS) return { ok: false, field: "days", message: `The subscription can last ${SUBSCRIPTION_MAX_DAYS} days at most.` };
  return { ok: true, config: { priceInrMinor: priceMinor, durationDays: days, enabled: d.enabled } };
}

/** Same value, however it is typed ("10000" and "10000.00"; "365" and "0365"). */
export function subscriptionDraftEq(a: SubscriptionDraft, b: SubscriptionDraft): boolean {
  const x = validateSubscriptionDraft(a);
  const y = validateSubscriptionDraft(b);
  if (x.ok && y.ok) return x.config.priceInrMinor === y.config.priceInrMinor && x.config.durationDays === y.config.durationDays && x.config.enabled === y.config.enabled;
  return a.price.trim() === b.price.trim() && a.days.trim() === b.days.trim() && a.enabled === b.enabled;
}

/** The derived dollar price (₹100 = $1) for what is typed so far, or null while the price is not valid. */
export function usdPreviewMinor(priceText: string): number | null {
  const minor = parseRupees(priceText);
  return minor !== null && minor > 0 ? inrMinorToUsdMinor(minor) : null;
}
