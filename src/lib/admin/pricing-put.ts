import { z } from "zod";

import { MAX_MINOR, parsePricingConfig, type PricingConfig, type StipendBands } from "../pricing-config.ts";
import { perHireFeeBodySchema, isPerHireFeeBody } from "./per-hire-fee-setting.ts";
import { isStipendBody, pricingConfigAuditMeta, stipendAuditMeta, stipendBodySchema } from "./pricing-config-setting.ts";
import type { PerHireFeeSetting } from "../per-hire-fee.ts";

/**
 * The pure half of `PUT /api/admin/pricing`: which of the three settings a
 * body is for, and whether it is valid. Pure (zod only), so `node --test`
 * covers it without a database; the route does the permission check, the
 * writes, the audit row and the cache purge around it.
 */

const activationFeeBodySchema = z.object({
  internActivationFeeMinor: z
    .number()
    .int()
    .min(0)
    .max(MAX_MINOR)
    .refine((v) => v > 0, "Fee must be above zero"),
});

export type PricingPut =
  | { kind: "stipend"; bands: StipendBands }
  | { kind: "perHireFee"; bands: PerHireFeeSetting }
  | { kind: "activationFee"; feeMinor: number }
  | { kind: "invalid"; error: string };

/** Picks the schema by the body's shape (stipend, then per-hire switches, then the activation fee) and validates it. */
export function parsePricingPut(body: unknown): PricingPut {
  if (isStipendBody(body)) {
    const r = stipendBodySchema.safeParse(body);
    return r.success ? { kind: "stipend", bands: r.data.internStipendBands } : { kind: "invalid", error: r.error.issues[0]?.message ?? "Invalid input" };
  }
  if (isPerHireFeeBody(body)) {
    const r = perHireFeeBodySchema.safeParse(body);
    return r.success ? { kind: "perHireFee", bands: r.data.perHireFeeBands } : { kind: "invalid", error: r.error.issues[0]?.message ?? "Invalid input" };
  }
  const r = activationFeeBodySchema.safeParse(body);
  return r.success ? { kind: "activationFee", feeMinor: r.data.internActivationFeeMinor } : { kind: "invalid", error: r.error.issues[0]?.message ?? "Invalid input" };
}

/** Audit meta for a stipend save: both full values, the plans that moved, and `{from,to}` per changed field. */
export function stipendSaveAuditMeta(from: StipendBands, to: StipendBands) {
  const a: PricingConfig = parsePricingConfig({ stipendBands: from });
  const b: PricingConfig = parsePricingConfig({ stipendBands: to });
  return { ...stipendAuditMeta(from, to), changes: pricingConfigAuditMeta(a, b).changes };
}

/** Audit meta for an activation-fee save: the long-standing `value` plus `{from,to}` per changed field. */
export function activationFeeAuditMeta(from: unknown, to: number) {
  const a = parsePricingConfig({ activationFeeMinor: from });
  const b = parsePricingConfig({ activationFeeMinor: to });
  return { value: { from, to }, changes: pricingConfigAuditMeta(a, b).changes };
}

/**
 * Every cached page that prints a price: the whole site layout, and
 * /llms.txt (a route handler with its own hourly cache). Each pricing write
 * purges all of these.
 */
export const PRICING_REVALIDATE: readonly { path: string; type?: "layout" | "page" }[] = [
  { path: "/", type: "layout" },
  { path: "/llms.txt" },
];
