"use client";

import { createContext, useContext, useMemo } from "react";

import { type PerHireFeeSetting } from "@/lib/per-hire-fee";
import { PRICING_DEFAULTS, feeSettingOf, type PricingConfig } from "@/lib/pricing-config";

/**
 * The live pricing config (every band's rate, hiring fee, free switch and
 * stipend, plus the activation fee) for client components on the public pages.
 * The marketing layout reads it once on the server and provides it here, so the
 * home score card, pricing page, plan cards and calculator all follow the one
 * admin edit. Without a provider the published defaults apply.
 */
const PricingConfigContext = createContext<PricingConfig>(PRICING_DEFAULTS);

export function PricingConfigProvider({ config, children }: { config: PricingConfig; children: React.ReactNode }) {
  return <PricingConfigContext.Provider value={config}>{children}</PricingConfigContext.Provider>;
}

export function usePricingConfig(): PricingConfig {
  return useContext(PricingConfigContext);
}

/** Which bands pay the hiring fee, taken from the live config (the same object the billing code reads). */
export function usePerHireFee(): PerHireFeeSetting {
  const config = usePricingConfig();
  return useMemo(() => feeSettingOf(config), [config]);
}
