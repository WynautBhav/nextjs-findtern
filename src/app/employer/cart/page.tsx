import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { redactForEmployer, toCandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { visibleInternIds } from "@/lib/employer-pool";
import { isBlockingInterview, meetingEndsAt } from "@/lib/employer-interview-rules";
import { hireFlowCounts } from "@/lib/employer-flow";
import { payableCheckout } from "@/lib/employer-payable";
import { timezoneForLocation } from "@/lib/timezones";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { HireFlow, type HireFlowCounts } from "@/components/employer/hire-flow";
import { CartManager, type CartLineItem } from "@/components/employer/cart-manager";

export const metadata: Metadata = {
  title: "Shortlist",
  robots: { index: false, follow: false },
};

type CartData = {
  lines: CartLineItem[];
  currency: Currency;
  timezone: string;
  counts: HireFlowCounts;
};

/**
 * The shortlist ("cart"). Nobody is hired from here (bug sheet 7 S1 r83):
 * the employer books a meeting if they want to talk first, sends a proposal,
 * and pays at checkout once it is accepted. The strip above the list shows
 * that whole path.
 */
export default async function EmployerCartPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; proposalId?: string; proposal?: string }>;
}) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const sp = await searchParams;
  // EMH-43: old "Proceed to hire" links were /employer/cart?tab=checkout&proposalId=…
  if (sp.tab === "checkout") {
    const id = sp.proposalId ?? sp.proposal;
    redirect(id ? `/employer/checkout?proposal=${encodeURIComponent(id)}` : "/employer/checkout");
  }

  const unlockAll = await isAdminViewing();
  const data = await loadCart(session.uid, unlockAll).catch((err) => {
    console.error("[employer/cart] load failed", err);
    return null;
  });

  if (!data) {
    return (
      <div>
        <PageHead title="Shortlist" />
        <EmptyScene
          art
          title="Couldn't load your shortlist"
          body="We couldn't reach your shortlisted candidates just now. They are still saved; try again in a moment."
          who="Us - connection issue"
          next={{ label: "Try again", href: "/employer/cart" }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="Shortlist"
        lede="Candidates you've saved. Book a meeting if you'd like to talk first, then send a proposal; you pay only once a candidate accepts."
      />
      <HireFlow counts={data.counts} current="cart" />
      <CartManager
        employerId={session.uid}
        initialCartLines={data.lines}
        currency={data.currency}
        unlockAll={unlockAll}
        timezone={data.timezone}
      />
    </div>
  );
}

async function loadCart(uid: string, unlockAll: boolean): Promise<CartData> {
  const db = getDb();
  const hired = await hiredInternIds(db, uid);

  const [employer] = await db
    .select({
      country: schema.employers.country,
      state: schema.employers.state,
      city: schema.employers.city,
      countryCode: schema.employers.countryCode,
      phoneNumber: schema.employers.phoneNumber,
    })
    .from(schema.employers)
    .where(eq(schema.employers.id, uid))
    .limit(1);
  const region = employerRegion(employer ?? {});
  const currency: Currency = region === "IN" ? "INR" : "USD";
  // Meetings are offered in the company's own timezone (bug sheet 7 S2 r3).
  const timezone = timezoneForLocation(employer ?? {});

  const [items, plans, proposals] = await Promise.all([
    db
      .select()
      .from(schema.employerCartItems)
      .where(
        and(
          eq(schema.employerCartItems.employerId, uid),
          // Legacy staged some rows as "checkout": still the shortlist (EMB-17).
          inArray(schema.employerCartItems.listType, ["cart", "checkout"]),
        ),
      )
      // Newest shortlist first (bug sheet 26 Oct).
      .orderBy(desc(schema.employerCartItems.createdAt)),
    db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true)),
    db
      .select({
        id: schema.proposals.id,
        internId: schema.proposals.internId,
        projectId: schema.proposals.projectId,
        status: schema.proposals.status,
      })
      .from(schema.proposals)
      .where(eq(schema.proposals.employerId, uid))
      .orderBy(desc(schema.proposals.createdAt)),
  ]);

  // One row per candidate and project; a legacy "checkout" twin of a "cart"
  // row would otherwise show the same person twice.
  const seenPair = new Set<string>();
  const unique = items.filter((i) => {
    const key = `${i.projectId}:${i.internId}`;
    if (seenPair.has(key)) return false;
    seenPair.add(key);
    return true;
  });

  const lines: CartLineItem[] = [];
  if (unique.length > 0) {
    const allInternIds = Array.from(new Set(unique.map((item) => item.internId)));
    // Rows whose intern left the pool (hid their profile, deactivated) drop
    // out, unless their offer from this employer is accepted or hired -
    // legacy purged them from cart and compare (employer-cart.tsx:1632).
    const visible = await visibleInternIds(db, uid, allInternIds);
    const internIds = allInternIds.filter((id) => visible.has(id));

    // EMB-26: once hired by this company (any project) a candidate leaves
    // every shortlist, as in legacy. An accepted offer (any project) goes to
    // checkout instead of a second proposal; an offer that is out links to it.
    const acceptedFor = new Map<string, string>();
    const openFor = new Map<string, string>();
    for (const p of proposals) {
      if ((p.status === "accepted" || p.status === "processing") && !acceptedFor.has(p.internId)) acceptedFor.set(p.internId, p.id);
      if (["draft", "sent", "interview_scheduled"].includes(p.status) && !openFor.has(p.internId)) openFor.set(p.internId, p.id);
    }

    // A meeting that is still open (booked, or slots offered) holds the
    // candidate until its time is over - the same rule the booking route
    // enforces - so "Book meeting" and "Send proposal" wait until then.
    const meetingRows = internIds.length
      ? await db
          .select()
          .from(schema.interviews)
          .where(
            and(
              eq(schema.interviews.employerId, uid),
              inArray(schema.interviews.internId, internIds),
              inArray(schema.interviews.status, ["pending", "scheduled"]),
            ),
          )
      : [];
    const meetingUntil = new Map<string, string>();
    for (const iv of meetingRows) {
      const end = meetingEndsAt(iv);
      if (!isBlockingInterview(iv) || end === null) continue;
      const prev = meetingUntil.get(iv.internId);
      if (!prev || Date.parse(prev) < end) meetingUntil.set(iv.internId, new Date(end).toISOString());
    }

    const projectIds = Array.from(new Set(unique.map((item) => item.projectId)));
    const [userRows, onboardingRows, projectRows] = await Promise.all([
      internIds.length
        ? db.select().from(schema.users).where(and(inArray(schema.users.id, internIds), eq(schema.users.isActive, true)))
        : Promise.resolve([] as (typeof schema.users.$inferSelect)[]),
      internIds.length
        ? db.select().from(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, internIds))
        : Promise.resolve([] as (typeof schema.internOnboarding.$inferSelect)[]),
      db
        .select({ id: schema.projects.id, projectName: schema.projects.projectName, status: schema.projects.status })
        .from(schema.projects)
        .where(and(eq(schema.projects.employerId, uid), inArray(schema.projects.id, projectIds))),
    ]);
    const usersById = new Map(userRows.map((row) => [row.id, row]));
    const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));
    const projectsById = new Map(projectRows.map((row) => [row.id, row]));

    for (const item of unique) {
      const user = usersById.get(item.internId);
      if (!user || hired.has(item.internId)) continue;
      // Name, email and recording stay server-side until hire.
      const candidate = redactForEmployer(toCandidateProfile(user, onboardingByUser.get(item.internId)), unlockAll);
      const pricing = resolvePricing(candidate.score, plans, currency, region);
      const project = projectsById.get(item.projectId);
      const projectStatus = String(project?.status ?? "active").toLowerCase();
      lines.push({
        id: item.id,
        projectId: item.projectId,
        projectName: project?.projectName ?? "Project",
        // Legacy writes "inactive"; earlier new-app builds wrote "closed" (EMH-03).
        projectClosed: ["closed", "inactive", "archived"].includes(projectStatus),
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        candidate,
        hourlyRateMinor: pricing.hourlyRateMinor,
        perHireMinor: pricing.perHireMinor,
        openProposalId: openFor.get(item.internId) ?? null,
        acceptedProposalId: acceptedFor.get(item.internId) ?? null,
        meetingUntil: meetingUntil.get(item.internId) ?? null,
      });
    }
  }

  // Same figure the checkout shows: accepted offers plus months now due.
  const toPay = (await payableCheckout(uid)).lines.length;
  const counts = await hireFlowCounts(uid, toPay);
  return { lines, currency, timezone, counts };
}
