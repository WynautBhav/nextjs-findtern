"use client";

import { createContext, useContext } from "react";

import { PER_HIRE_FEE_DEFAULT, type PerHireFeeSetting } from "@/lib/per-hire-fee";

/**
 * The live hiring-fee setting for client components on the public pages.
 * The marketing layout reads it once on the server and provides it here, so
 * the home table, pricing page, plan cards and calculator all follow the one
 * admin setting. Without a provider the defaults apply.
 */
const PerHireFeeContext = createContext<PerHireFeeSetting>(PER_HIRE_FEE_DEFAULT);

export function PerHireFeeProvider({ setting, children }: { setting: PerHireFeeSetting; children: React.ReactNode }) {
  return <PerHireFeeContext.Provider value={setting}>{children}</PerHireFeeContext.Provider>;
}

export function usePerHireFee(): PerHireFeeSetting {
  return useContext(PerHireFeeContext);
}
