import { inrMinorToUsdMinor } from "../currency.ts";
import { featuredLosers, pickFeaturedWinner } from "../pricing-featured.ts";
import { legacyBandChange } from "./plan-band.ts";

/**
 * The plan half of `PATCH /api/admin/pricing`, free of the database: the route
 * hands it a `PlanStore` bound to one transaction, so `node --test` can run the
 * rules against an in-memory store.
 *
 * Rules enforced here, inside that one transaction:
 *  - "Most popular" is one plan per currency set. Featuring a plan un-features the
 *    others (INR rows, and the USD rows kept for the legacy site), and every save also
 *    heals rows that already carry more than one flag (most recently updated wins).
 *  - Concurrent saves are serialised by `lock()`, so two plans featured at the same
 *    moment cannot both keep the flag or both lose it.
 */

export type PlanRow = {
  id: string;
  slug: string;
  displayName: string;
  currency: string;
  features: string[] | null;
  isFeatured: boolean;
  updatedAt: Date | string | null;
} & Record<string, unknown>;

/** The fields a PATCH may set (already validated by the route's zod schema). */
export type PlanFields = Partial<{
  displayName: string;
  priceHourlyMinor: number;
  perHireChargeMinor: number;
  compareAtHourlyMinor: number | null;
  compareAtPerHireMinor: number | null;
  internshipDuration: string;
  features: string[];
  featureList: { label: string; included: boolean }[];
  isFeatured: boolean;
  isActive: boolean;
}>;

export interface PlanStore {
  /** Serialise every pricing writer until the transaction ends (an advisory transaction lock). */
  lock(): Promise<void>;
  getPlan(id: string): Promise<PlanRow | undefined>;
  updatePlan(id: string, set: Record<string, unknown>): Promise<void>;
  updateUsdBySlug(slug: string, set: Record<string, unknown>): Promise<void>;
  /** Every INR row, current as of this transaction's own writes. */
  listInr(): Promise<PlanRow[]>;
  unfeatureInr(ids: string[], at: Date): Promise<void>;
  /** Makes the USD rows match: flagged only where the slug is `slug` (none flagged when null). */
  syncUsdFeatured(slug: string | null, at: Date): Promise<void>;
}

export type WritePlanResult =
  | { ok: true; before: PlanRow; unfeatured: PlanRow[] }
  | { ok: false; status: 400 | 404; error: string };

/** USD = INR at the fixed rate; a null or undefined stays as it is. */
const usd = (v: number | null | undefined) => (v == null ? v : inrMinorToUsdMinor(v));

export async function writePlan(store: PlanStore, id: string, fields: PlanFields, now: Date): Promise<WritePlanResult> {
  await store.lock();

  const plan = await store.getPlan(id);
  if (!plan || plan.currency.toUpperCase() !== "INR") return { ok: false, status: 404, error: "Unknown plan" };

  // DB-26: legacy prices candidates from features[1]; never let a reword break a band it can read.
  if (fields.features) {
    const change = legacyBandChange((plan.features ?? [])[1], fields.features[1]);
    if (change?.block) return { ok: false, status: 400, error: change.message };
  }

  await store.updatePlan(id, { ...fields, updatedAt: now });

  // ADM-17: the new app derives USD from INR, but the legacy site (rollback target) still
  // reads its own USD rows. Keep them in step at ₹100 = $1, the featured flag included.
  const mirror = Object.fromEntries(
    Object.entries({
      displayName: fields.displayName,
      priceHourlyMinor: usd(fields.priceHourlyMinor),
      perHireChargeMinor: usd(fields.perHireChargeMinor),
      compareAtHourlyMinor: usd(fields.compareAtHourlyMinor),
      compareAtPerHireMinor: usd(fields.compareAtPerHireMinor),
      internshipDuration: fields.internshipDuration,
      features: fields.features,
      isFeatured: fields.isFeatured,
      isActive: fields.isActive,
    }).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(mirror).length) await store.updateUsdBySlug(plan.slug, { ...mirror, updatedAt: now });

  // One "Most popular" at a time: the plan just featured wins; otherwise any duplicates
  // already in the table are healed (most recently updated stays).
  const rows = await store.listInr();
  const loserIds = featuredLosers(rows, fields.isFeatured ? id : undefined);
  if (loserIds.length) await store.unfeatureInr(loserIds, now);
  if (loserIds.length || fields.isFeatured !== undefined) {
    const after = rows.map((r) => (loserIds.includes(r.id) ? { ...r, isFeatured: false } : r));
    const winnerId = pickFeaturedWinner(after);
    const winner = after.find((r) => r.id === winnerId);
    await store.syncUsdFeatured(winner ? winner.slug : null, now);
  }

  return { ok: true, before: plan, unfeatured: rows.filter((r) => loserIds.includes(r.id)) };
}
