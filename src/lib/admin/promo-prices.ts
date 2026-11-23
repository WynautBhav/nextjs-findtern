import type { PromoPrices } from "@/lib/admin/promo-edit-rules";
import { getEmployerSubscriptionConfig, getPricingConfig } from "@/lib/platform-settings";

/** The list prices a fixed promo code is measured against (a code that covers one is a free code). Never throws: defaults on a missing setting. */
export async function loadPromoPrices(): Promise<PromoPrices> {
  const [pricing, subscription] = await Promise.all([getPricingConfig(), getEmployerSubscriptionConfig()]);
  return { activationMinor: pricing.activationFeeInrMinor, subscriptionMinor: subscription.priceInrMinor };
}
