import { z } from "zod";

import { FEE_BAND_LABEL } from "../per-hire-fee.ts";
import {
  BAND_IDS,
  MAX_MINOR,
  parseStipendBands,
  validatePricingConfig,
  type PricingConfig,
  type StipendBands,
} from "../pricing-config.ts";

/**
 * Admin validation for the editable pricing figures. Pure (zod only), so
 * `node --test` loads it; the route (api/admin/pricing) and the editor share it.
 * The whole-config rules (amounts in whole minor units from 0 to 100,000,000,
 * a hiring fee above 0, an activation fee above 0, fixed contiguous score
 * ranges) live in `validatePricingConfig` (lib/pricing-config.ts), re-exported here.
 */
export { validatePricingConfig, parseStipendBands };

const amount = (what: string) =>
  z
    .number({ message: `${what} must be a number.` })
    .int(`${what} must be a whole number of paise.`)
    .min(0, `${what} can't be negative.`)
    .max(MAX_MINOR, `${what} is too large.`);

/**
 * The admin PUT body for the per-band intern stipend:
 * `{ internStipendBands: { standard: null, skilled, assured } }`, INR paise.
 * Strict: all three bands present, Espresso explicitly null (a score below 6
 * is not paid a stipend), nothing else, so a typo never leaves a band at its old value.
 */
export const stipendBandsSchema = z.strictObject(
  {
    standard: z.null({ message: "Espresso has no stipend: a score below 6 is not paid one." }),
    skilled: amount("The Cappuccino stipend"),
    assured: amount("The Latte stipend"),
  },
  { message: "Send all three bands: standard, skilled and assured." },
);

export const stipendBodySchema = z.strictObject({ internStipendBands: stipendBandsSchema }, { message: "Invalid input" });

/** True when the body is the stipend shape (so the route picks this schema over the others). */
export function isStipendBody(body: unknown): boolean {
  return Boolean(body) && typeof body === "object" && !Array.isArray(body) && "internStipendBands" in (body as object);
}

/** Audit meta for the stipend setting: the plan names whose stipend moved, with both full values. */
export function stipendAuditMeta(from: StipendBands, to: StipendBands) {
  const changed = BAND_IDS.filter((b) => from[b] !== to[b]).map((b) => FEE_BAND_LABEL[b].plan);
  return { value: { from, to }, changed };
}

/**
 * One audit entry per save: `{from, to}` for each field that changed, keyed
 * `<band>.<field>` (`skilled.hourlyInrMinor`) or `activationFeeInrMinor`.
 */
export function pricingConfigAuditMeta(from: PricingConfig, to: PricingConfig) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const id of BAND_IDS) {
    const a = from.bands.find((b) => b.id === id);
    const b = to.bands.find((x) => x.id === id);
    if (!a || !b) continue;
    for (const field of ["hourlyInrMinor", "hireFeeInrMinor", "hireFeeCharged", "stipendInrMinor"] as const) {
      if (a[field] !== b[field]) changes[`${id}.${field}`] = { from: a[field], to: b[field] };
    }
  }
  if (from.activationFeeInrMinor !== to.activationFeeInrMinor) {
    changes.activationFeeInrMinor = { from: from.activationFeeInrMinor, to: to.activationFeeInrMinor };
  }
  return { changes, changed: Object.keys(changes) };
}
