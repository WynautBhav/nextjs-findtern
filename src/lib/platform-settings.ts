import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";
import { SUBSCRIPTION_DEFAULTS, parseSubscriptionConfig, parseSubscriptionOverrides, type SubscriptionConfig, type SubscriptionOverride } from "@/lib/employer-subscription";
import { PER_HIRE_FEE_DEFAULT, PER_HIRE_FEE_KEY, parsePerHireFeeSetting, type PerHireFeeSetting } from "@/lib/per-hire-fee";
import { INTERN_STIPEND_KEY, PRICING_DEFAULTS, STIPEND_BANDS_DEFAULT, parsePricingConfig, type PricingConfig } from "@/lib/pricing-config";

/**
 * Admin-editable platform values, one `platform_settings` row per key.
 * Every key has a code default, so a missing row (fresh DB, or no DB at
 * build time) never breaks a page or a payment.
 */

export const SETTING_DEFAULTS = {
  /** Intern activation fee, INR paise, GST-inclusive. */
  intern_activation_fee_minor: PRICING_DEFAULTS.activationFeeInrMinor,
  /** Which score bands pay the one-time hiring fee (lib/per-hire-fee.ts). */
  [PER_HIRE_FEE_KEY]: PER_HIRE_FEE_DEFAULT,
  /** Fixed monthly intern stipend per score band, INR paise (lib/pricing-config.ts); null for Espresso. */
  [INTERN_STIPEND_KEY]: STIPEND_BANDS_DEFAULT,
  /** Employer subscription: price (INR paise, EXCLUDING GST; India pays 18% GST on top), length in days, on/off (lib/employer-subscription.ts). */
  employer_subscription: SUBSCRIPTION_DEFAULTS,
  /** Per-employer admin grants and revokes, keyed by employer id (lib/employer-subscription.ts). */
  employer_subscription_overrides: {} as Record<string, SubscriptionOverride>,
  /** Days after an AI-interview link is sent before an uncompleted interview reads as expired. */
  ai_link_expiry_days: 7,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/**
 * One page render reads the same key several times (per-hire fee from the layout strip, the checkout and the page body).
 * `cache` makes this map per request (outside a render it is a fresh map every call, i.e. no memo), and `setSetting`
 * drops the key, so a write followed by a read in the same request still sees the new value.
 */
const requestSettings = cache(() => new Map<string, Promise<unknown>>());

export function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const memo = requestSettings();
  let hit = memo.get(key);
  if (!hit) {
    hit = readSetting(key);
    memo.set(key, hit);
  }
  return hit as Promise<(typeof SETTING_DEFAULTS)[K]>;
}

async function readSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  if (!hasDb()) return SETTING_DEFAULTS[key];
  try {
    const db = getDb();
    const [row] = await db
      .select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, key))
      .limit(1);
    return (row?.value ?? SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
  } catch {
    return SETTING_DEFAULTS[key];
  }
}

export async function setSetting(key: SettingKey, value: unknown, adminId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.platformSettings)
    .values({ key, value, updatedBy: adminId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value, updatedBy: adminId, updatedAt: new Date() },
    });
  requestSettings().delete(key);
}

export function getInternActivationFeeMinor(): Promise<number> {
  return getSetting("intern_activation_fee_minor").then(Number);
}

/**
 * The live per-hire setting. Never throws: no DB, no row, or a garbled value
 * all give the default (Espresso charged, Cappuccino and Latte free), so a
 * page or a payment never fails on it.
 */
export async function getPerHireFeeSetting(): Promise<PerHireFeeSetting> {
  return parsePerHireFeeSetting(await getSetting(PER_HIRE_FEE_KEY));
}

/**
 * Every band's money in one object (lib/pricing-config.ts): the INR
 * `pricing_plans` rows (hourly rate, hiring-fee amount), the per-hire switch,
 * the stipend setting and the activation fee. Never throws: no DB, a missing
 * row or a garbled value gives that field's default, so a page or a payment
 * never fails on it. `getPerHireFeeSetting` and `getInternActivationFeeMinor`
 * stay for callers that need only their own value (one cheap read).
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  if (!hasDb()) return parsePricingConfig();
  try {
    const [feeSetting, activationFeeMinor, stipendBands, plans] = await Promise.all([
      getPerHireFeeSetting(),
      getSetting("intern_activation_fee_minor"),
      getSetting(INTERN_STIPEND_KEY),
      getDb()
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.isActive, true))
        .catch(() => []),
    ]);
    return parsePricingConfig({ plans, feeSetting, stipendBands, activationFeeMinor });
  } catch {
    return parsePricingConfig();
  }
}

/** The live subscription config. Never throws: no DB, no row or a garbled field gives that field's default. */
export async function getEmployerSubscriptionConfig(): Promise<SubscriptionConfig> {
  return parseSubscriptionConfig(await getSetting("employer_subscription"));
}

/** Admin grants and revokes by employer id. Never throws: anything unreadable is "none". */
export async function getEmployerSubscriptionOverrides(): Promise<Record<string, SubscriptionOverride>> {
  return parseSubscriptionOverrides(await getSetting("employer_subscription_overrides"));
}

/** Days before an unfinished AI interview with a sent link expires: a whole number 1-365, else 7. Never throws. */
export async function getAiLinkExpiryDays(): Promise<number> {
  const raw: unknown = await getSetting("ai_link_expiry_days");
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 365 ? n : SETTING_DEFAULTS.ai_link_expiry_days;
}
