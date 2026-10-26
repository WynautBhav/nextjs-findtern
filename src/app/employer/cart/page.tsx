import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { redactForEmployer, toCandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { visibleInternIds } from "@/lib/employer-pool";
import { isBlockingInterview, meetingEndsAt } from "@/lib/employer-interview-rules";
import { timezoneForLocation } from "@/lib/timezones";
import { PageHeader } from "@/components/layout/page-header";
import { CartManager, type CartLineItem } from "@/components/employer/cart-manager";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default async function EmployerCartPage() {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;

  let cartLines: CartLineItem[] = [];
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  let nameUnlockedIds: string[] = [];
  let awaitingPayment = 0;
  let timezone = "Asia/Kolkata";
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
        state: schema.employers.state,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
      })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);
    region = employerRegion(employer ?? {});
    currency = region === "IN" ? "INR" : "USD";
    // Meetings are offered in the company's own timezone (bug sheet 26 Oct).
    timezone = timezoneForLocation(employer ?? {});

    awaitingPayment = (
      await db
        .select({ id: schema.proposals.id })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, uid), inArray(schema.proposals.status, ["accepted", "processing"])))
    ).length;

    const items = await db
      .select()
      .from(schema.employerCartItems)
      .where(eq(schema.employerCartItems.employerId, uid))
      // Newest shortlist first (bug sheet 26 Oct).
      .orderBy(desc(schema.employerCartItems.createdAt));

    try {
      plans = await db
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.isActive, true));
    } catch {
      // Fallback
    }

    if (items.length > 0) {
      const allInternIds = Array.from(new Set(items.map((item) => item.internId)));
      // Rows whose intern left the pool (hid their profile, deactivated) drop
      // out, unless this employer already has a relationship with them -
      // legacy purged them from cart and compare (employer-cart.tsx:1632).
      const visible = await visibleInternIds(db, uid, allInternIds);
      const internIds = allInternIds.filter((id) => visible.has(id));
      // Pairs already accepted or hired are past the shortlist.
      const settled = await db
        .select({ projectId: schema.proposals.projectId, internId: schema.proposals.internId })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, uid),
            inArray(schema.proposals.status, ["accepted", "processing", "hired"]),
          ),
        );
      const settledPairs = new Set(settled.map((r) => `${r.projectId}:${r.internId}`));
      // An offer already out (one live offer per candidate, on any project):
      // the line links to it instead of offering "Send Proposal" again, which
      // made a sent proposal look like it had gone nowhere.
      const openRows = await db
        .select({ id: schema.proposals.id, internId: schema.proposals.internId, projectId: schema.proposals.projectId })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, uid),
            inArray(schema.proposals.status, ["draft", "sent", "interview_scheduled"]),
          ),
        )
        .orderBy(desc(schema.proposals.createdAt));
      const openProposal = new Map<string, string>();
      for (const row of openRows) if (!openProposal.has(row.internId)) openProposal.set(row.internId, row.id);

      // A meeting that is still open (booked, or slots offered) holds the
      // candidate until its time is over - the same rule the booking route
      // enforces - so "Book Meeting" stays disabled until then.
      const meetingRows = await db
        .select()
        .from(schema.interviews)
        .where(
          and(
            eq(schema.interviews.employerId, uid),
            inArray(schema.interviews.internId, allInternIds),
            inArray(schema.interviews.status, ["pending", "scheduled"]),
          ),
        );
      const meetingUntil = new Map<string, string>();
      for (const iv of meetingRows) {
        const end = meetingEndsAt(iv);
        if (!isBlockingInterview(iv) || end === null) continue;
        const prev = meetingUntil.get(iv.internId);
        if (!prev || Date.parse(prev) < end) meetingUntil.set(iv.internId, new Date(end).toISOString());
      }

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
        if (settledPairs.has(`${item.projectId}:${item.internId}`)) return null;
        // Name, email and recording stay server-side until hire.
        const candidate = redactForEmployer(
          toCandidateProfile(user, onboardingByUser.get(item.internId)),
          unlockAll || nameUnlockedIds.includes(item.internId),
        );
        const pricing = resolvePricing(candidate.score, plans, currency, region);

        return {
          id: item.id,
          projectId: item.projectId,
          projectName: projectNames.get(item.projectId) ?? "Project",
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
          candidate,
          hourlyRateMinor: pricing.hourlyRateMinor,
          perHireMinor: pricing.perHireMinor,
          openProposalId: openProposal.get(item.internId) ?? null,
          meetingUntil: meetingUntil.get(item.internId) ?? null,
        };
      };

      cartLines = items
        .filter((item) => item.listType === "cart")
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
        awaitingPayment={awaitingPayment}
        currency={currency}
        nameUnlockedIds={nameUnlockedIds}
        unlockAll={unlockAll}
        timezone={timezone}
      />
    </div>
  );
}
