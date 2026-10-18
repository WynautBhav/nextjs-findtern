import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { PageHeader } from "@/components/layout/page-header";
import { CartManager, type CartLineItem } from "@/components/employer/cart-manager";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default async function EmployerCartPage() {
  const session = await requireRole("employer");
  const uid = session.uid;

  let cartLines: CartLineItem[] = [];
  let stagedLines: CartLineItem[] = [];
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  let nameUnlockedIds: string[] = [];
  const unlockAll = await isAdminViewing();

  try {
    const db = getDb();

    try {
      nameUnlockedIds = Array.from(await hiredInternIds(db, uid));
    } catch {
      nameUnlockedIds = [];
    }

    const [employer] = await db
      .select({
        country: schema.employers.country,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
      })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);
    region = employerRegion(employer ?? {});
    currency = region === "IN" ? "INR" : "USD";

    const items = await db
      .select()
      .from(schema.employerCartItems)
      .where(eq(schema.employerCartItems.employerId, uid))
      .orderBy(asc(schema.employerCartItems.createdAt));

    try {
      plans = await db
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.isActive, true));
    } catch {
      // Fallback
    }

    if (items.length > 0) {
      const internIds = Array.from(new Set(items.map((item) => item.internId)));
      const projectIds = Array.from(new Set(items.map((item) => item.projectId)));

      const [userRows, onboardingRows, projectRows] = await Promise.all([
        db
          .select()
          .from(schema.users)
          .where(and(inArray(schema.users.id, internIds), eq(schema.users.isActive, true))),
        db
          .select()
          .from(schema.internOnboarding)
          .where(inArray(schema.internOnboarding.userId, internIds)),
        db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.employerId, uid),
              inArray(schema.projects.id, projectIds),
            ),
          ),
      ]);

      const usersById = new Map(userRows.map((row) => [row.id, row]));
      const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));
      const projectNames = new Map(projectRows.map((row) => [row.id, row.projectName]));

      const parseItem = (item: typeof items[number]): CartLineItem | null => {
        const user = usersById.get(item.internId);
        if (!user) return null;
        const candidate = toCandidateProfile(user, onboardingByUser.get(item.internId));
        const pricing = resolvePricing(candidate.score, plans, currency, region);

        return {
          id: item.id,
          projectId: item.projectId,
          projectName: projectNames.get(item.projectId) ?? "Project",
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
          candidate,
          hourlyRateMinor: pricing.hourlyRateMinor,
          perHireMinor: pricing.perHireMinor,
        };
      };

      cartLines = items
        .filter((item) => item.listType === "cart")
        .map(parseItem)
        .filter((l): l is CartLineItem => l !== null);

      stagedLines = items
        .filter((item) => item.listType === "checkout")
        .map(parseItem)
        .filter((l): l is CartLineItem => l !== null);
    }
  } catch {
    // Database fallback
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cart & Hiring Queue"
        subtitle="Review shortlisted talent, schedule preliminary interviews, send customized proposals, or proceed to hire."
      />

      <CartManager
        employerId={uid}
        initialCartLines={cartLines}
        initialStagedLines={stagedLines}
        currency={currency}
        nameUnlockedIds={nameUnlockedIds}
        unlockAll={unlockAll}
      />
    </div>
  );
}
