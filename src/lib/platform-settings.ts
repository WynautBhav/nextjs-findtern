import { eq } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";
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
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
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
