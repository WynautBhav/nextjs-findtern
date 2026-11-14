import { z } from "zod";

import { FEE_BANDS, FEE_BAND_LABEL, type PerHireFeeSetting } from "../per-hire-fee.ts";

/**
 * The admin PUT body for the per-band hiring-fee switches:
 * `{ perHireFeeBands: { standard, skilled, assured } }`. Strict: all three
 * bands present, real booleans, nothing else, so a typo can never silently
 * leave a band at its old value.
 */
export const perHireFeeBandsSchema = z.strictObject(
  {
    standard: z.boolean({ message: "Espresso must be on or off." }),
    skilled: z.boolean({ message: "Cappuccino must be on or off." }),
    assured: z.boolean({ message: "Latte must be on or off." }),
  },
  { message: "Send all three bands: standard, skilled and assured." },
);

export const perHireFeeBodySchema = z.strictObject(
  { perHireFeeBands: perHireFeeBandsSchema },
  { message: "Invalid input" },
);

/** True when the body is the per-band shape (so the route picks this schema over the activation-fee one). */
export function isPerHireFeeBody(body: unknown): boolean {
  return Boolean(body) && typeof body === "object" && !Array.isArray(body) && "perHireFeeBands" in (body as object);
}

/** Audit meta: the plan names whose switch moved, with both full values. */
export function perHireFeeAuditMeta(from: PerHireFeeSetting, to: PerHireFeeSetting) {
  const changed = FEE_BANDS.filter((b) => from[b] !== to[b]).map((b) => FEE_BAND_LABEL[b].plan);
  return { value: { from, to }, changed };
}
