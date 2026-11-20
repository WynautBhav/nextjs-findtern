import { asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { CACHE_TAGS, cachedRead, reviveDates } from "@/lib/server-cache";

/**
 * The global, rarely-changing table reads served from the 5-minute server cache (lib/server-cache.ts has the rules).
 * Each one is a plain select with no user, employer or session in it, so one entry serves everybody; each throws on
 * a failed read (callers keep their own fallback) and returns the exact row shape the live query does.
 */

export type PricingPlanRow = typeof schema.pricingPlans.$inferSelect;

const activePlansUnordered = cachedRead(["pricing-plans-active"], [CACHE_TAGS.plans], async (): Promise<PricingPlanRow[]> =>
  getDb().select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true)),
);

const activePlansOrdered = cachedRead(["pricing-plans-active", "by-sort-order"], [CACHE_TAGS.plans], async (): Promise<PricingPlanRow[]> =>
  getDb().select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true)).orderBy(asc(schema.pricingPlans.sortOrder)),
);

/** Active pricing plan rows (every employer page, the public rate card). `sorted` is the public site's sort order. */
export async function getActivePricingPlans(sorted = false): Promise<PricingPlanRow[]> {
  return reviveDates(schema.pricingPlans, await (sorted ? activePlansOrdered() : activePlansUnordered()));
}

export type FeaturedSkillRow = typeof schema.websiteFeaturedSkills.$inferSelect;

const activeFeaturedSkills = cachedRead(["featured-skills-active"], [CACHE_TAGS.skills], async (): Promise<FeaturedSkillRow[]> =>
  getDb().select().from(schema.websiteFeaturedSkills).where(eq(schema.websiteFeaturedSkills.isActive, true)).orderBy(asc(schema.websiteFeaturedSkills.sortOrder)),
);

/** The skills catalog rows the public site lists (the live bench counts are layered on top, uncached here). */
export async function getActiveFeaturedSkillRows(): Promise<FeaturedSkillRow[]> {
  return reviveDates(schema.websiteFeaturedSkills, await activeFeaturedSkills());
}

export type CollegePartnerRow = { id: string; name: string; city: string | null; logoUrl: string | null };

const partnerColleges = cachedRead(["partner-colleges"], [CACHE_TAGS.colleges], async (): Promise<CollegePartnerRow[]> => {
  const c = schema.colleges;
  return getDb()
    .select({ id: c.id, name: c.name, city: c.city, logoUrl: c.logoUrl })
    .from(c)
    .where(sql`${c.isActive} AND ${c.isPartner} AND ${c.showOnWebsite}`)
    .orderBy(asc(c.sortOrder), asc(c.name));
});

/** Partner colleges Findtern staff chose to show on the public site. */
export function getPartnerCollegeRows(): Promise<CollegePartnerRow[]> {
  return partnerColleges();
}
