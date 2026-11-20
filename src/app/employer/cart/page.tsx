import type { Metadata } from "next";
import { serializeJoinInput } from "@/lib/interview-join";
import { Scale } from "lucide-react";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { redactForEmployer, toCandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { attachPhotos, visibleInternIds } from "@/lib/employer-pool";
import { pendingMeetingAtFor } from "@/lib/proposal-guard";
import { isBlockingInterview, isMeetingLinkLive, meetingEndsAt } from "@/lib/employer-interview-rules";
import { cartInternIdsForRequest, hireFlowCounts, loadFlowProposals } from "@/lib/employer-flow";
import { normalizeStatus } from "@/components/employer/proposal-bucket";
import { payableCheckoutForRequest } from "@/lib/employer-payable";
import { getEmployerRows } from "@/lib/employer-request";
import { gated } from "@/lib/request-gate";
import { timezoneForLocation } from "@/lib/timezones";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { HireFlow, type HireFlowCounts } from "@/components/employer/hire-flow";
import { ButtonLink } from "@/components/ui/button";
import { rememberedSelection } from "@/lib/employer-selection";
import { isProjectOpen } from "@/lib/project-locations";
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
  // The setup check runs beside the page's reads, not ahead of them (one round trip less); its redirect still wins.
  const setup = requireEmployerSetup(session.uid);
  setup.catch(() => undefined);
  const sp = await searchParams;
  // EMH-43: old "Proceed to hire" links were /employer/cart?tab=checkout&proposalId=…
  if (sp.tab === "checkout") {
    const id = sp.proposalId ?? sp.proposal;
    await setup;
    redirect(id ? `/employer/checkout?proposal=${encodeURIComponent(id)}` : "/employer/checkout");
  }

  const unlockAll = await isAdminViewing();
  const compareCount = (await rememberedSelection(session.uid)).compare.length;
  const [, data] = await Promise.all([
    setup,
    loadCart(session.uid, unlockAll).catch((err) => {
      console.error("[employer/cart] load failed", err);
      return null;
    }),
  ]);

  if (!data) {
    return (
      <div>
        <PageHead title="Shortlist" />
        <LoadError what="your shortlist" retryHref="/employer/cart" email={SITE.adminEmail} />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="Shortlist"
        // The path strip under the head says the same steps; phones keep the list higher.
        lede={<span className="max-sm:sr-only">Book a meeting or send a proposal. You pay only once a candidate accepts.</span>}
        action={
          // Compare lives here, not in a second tab bar: the pipeline strip below already has Candidates and Shortlist.
          <ButtonLink href="/employer/compare" size="sm" variant="outline" className="h-11 rounded-xl sm:h-10 sm:touch:h-11">
            <Scale className="size-4" aria-hidden />
            Compare{compareCount > 0 ? ` (${compareCount})` : ""}
          </ButtonLink>
        }
        className="mb-4 lg:mb-5"
      />
      {/* The strip counts people, not proposals. */}
      <div title="People, not proposals">
        <p className="sr-only">People, not proposals.</p>
        <HireFlow counts={data.counts} current="cart" />
      </div>
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
  // Wave 1: every read that depends on nothing else starts now, including the strip's figures (accepted offers to pay, proposals,
  // saved rows), which do not depend on the list. `gated` caps the reads in flight like the dashboard does; the employer row is
  // started first because the payable read shares it (request-cached). The no-op catch only keeps a read that is never reached
  // (an earlier one failed) from becoming an unhandled rejection; a failure still fails the load, as before.
  const early = <T,>(p: PromiseLike<T>): Promise<T> => {
    const q = Promise.resolve(p);
    q.catch(() => undefined);
    return q;
  };
  const employerP = early(getEmployerRows(uid));
  const hiredP = early(gated(() => hiredInternIds(db, uid)));
  const itemsP = early(
    gated(() =>
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
    ),
  );
  const plansP = early(gated(() => db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true))));
  const proposalsP = early(
    gated(() =>
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
    ),
  );
  const feeP = early(getPerHireFeeSetting());
  // Same figure the checkout shows: accepted offers plus months now due. All three are request-cached, so counting them below is not another round trip.
  const payableP = early(gated(() => payableCheckoutForRequest(uid)));
  const flowP = early(gated(() => loadFlowProposals(uid)));
  const cartIdsP = early(gated(() => cartInternIdsForRequest(uid)));

  const [employer] = await employerP;
  const region = employerRegion(employer ?? {});
  const currency: Currency = region === "IN" ? "INR" : "USD";
  // Meetings are offered in the company's own timezone (bug sheet 7 S2 r3).
  const timezone = timezoneForLocation(employer ?? {});

  const [hired, items, plans, proposals, feeSetting] = await Promise.all([hiredP, itemsP, plansP, proposalsP, feeP]);

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
    // Wave 2: the pool check and every read keyed on the saved rows start together. The reads below take every saved candidate,
    // not only the visible ones (they do not wait for the pool check); a candidate the pool check drops is skipped further down,
    // so nothing about them is used or shown.
    const projectIds = Array.from(new Set(unique.map((item) => item.projectId)));
    const [visible, meetingRows, userRows, onboardingRows, projectRows] = await Promise.all([
      visibleInternIds(db, uid, allInternIds),
      // A meeting that is still open (booked, or slots offered) holds the
      // candidate until its time is over - the same rule the booking route
      // enforces - so "Book meeting" and "Send proposal" wait until then.
      db
        .select()
        .from(schema.interviews)
        .where(and(eq(schema.interviews.employerId, uid), inArray(schema.interviews.internId, allInternIds), inArray(schema.interviews.status, ["pending", "scheduled"]))),
      db.select().from(schema.users).where(and(inArray(schema.users.id, allInternIds), eq(schema.users.isActive, true))),
      db.select().from(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, allInternIds)),
      db
        .select({ id: schema.projects.id, projectName: schema.projects.projectName, status: schema.projects.status, takenDownAt: schema.projects.takenDownAt, timezone: schema.projects.timezone })
        .from(schema.projects)
        .where(and(eq(schema.projects.employerId, uid), inArray(schema.projects.id, projectIds))),
    ]);

    // EMB-26: once hired by this company (any project) a candidate leaves
    // every shortlist, as in legacy. An accepted offer (any project) goes to
    // checkout instead of a second proposal; an offer that is out links to it.
    const acceptedFor = new Map<string, string>();
    const openFor = new Map<string, string>();
    for (const p of proposals) {
      // Legacy rows may be cased or spaced differently ("Sent"); the shared normaliser matches them.
      const status = normalizeStatus(p.status);
      if ((status === "accepted" || status === "processing") && !acceptedFor.has(p.internId)) acceptedFor.set(p.internId, p.id);
      if (["draft", "sent", "interview_scheduled"].includes(status) && !openFor.has(p.internId)) openFor.set(p.internId, p.id);
    }

    const meetingUntil = new Map<string, string>();
    // A booked meeting's link, while it is live, so the cart can join it (bug sheet 8).
    const meetingLinks = new Map<string, { id: string; link: string; join: ReturnType<typeof serializeJoinInput> }>();
    for (const iv of meetingRows) {
      if (iv.status === "scheduled" && iv.selectedSlot && iv.meetingLink && isMeetingLinkLive(iv)) meetingLinks.set(iv.internId, { id: iv.id, link: iv.meetingLink, join: serializeJoinInput(iv) });
      const end = meetingEndsAt(iv);
      if (!isBlockingInterview(iv) || end === null) continue;
      const prev = meetingUntil.get(iv.internId);
      if (!prev || Date.parse(prev) < end) meetingUntil.set(iv.internId, new Date(end).toISOString());
    }

    const usersById = new Map(userRows.map((row) => [row.id, row]));
    const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));
    const projectsById = new Map(projectRows.map((row) => [row.id, row]));

    for (const item of unique) {
      const user = usersById.get(item.internId);
      if (!user || !visible.has(item.internId) || hired.has(item.internId)) continue;
      // Name, email and recording stay server-side until hire.
      const candidate = redactForEmployer(toCandidateProfile(user, onboardingByUser.get(item.internId)), unlockAll);
      const pricing = resolvePricing(candidate.score, plans, currency, region, feeSetting);
      const project = projectsById.get(item.projectId);
      lines.push({
        id: item.id,
        projectId: item.projectId,
        projectName: project?.projectName ?? "Project",
        projectTimezone: project?.timezone ?? null,
        // Not open for new offers: closed (legacy "inactive", "closed", "archived"), paused, draft, rejected or taken down.
        projectClosed: project ? !isProjectOpen(project.status, project.takenDownAt) : false,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        candidate,
        hourlyRateMinor: pricing.hourlyRateMinor,
        perHireMinor: pricing.perHireMinor,
        openProposalId: openFor.get(item.internId) ?? null,
        acceptedProposalId: acceptedFor.get(item.internId) ?? null,
        meetingUntil: meetingUntil.get(item.internId) ?? null,
        meetingAt: pendingMeetingAtFor(meetingRows.filter((iv) => iv.internId === item.internId), { projectId: item.projectId }),
        meetingLink: meetingLinks.get(item.internId)?.link ?? null,
        meetingInterviewId: meetingLinks.get(item.internId)?.id ?? null,
        meetingJoin: meetingLinks.get(item.internId)?.join ?? null,
        meetingNow: new Date().toISOString(),
      });
    }
  }

  // Photos show before hire (owner call, 6 Nov); names stay initials. One query.
  await attachPhotos(
    db,
    lines.map((l) => l.candidate),
  );

  // The strip's reads started in wave 1 and are request-cached, so counting them here is not another round trip.
  const [payable] = await Promise.all([payableP, flowP, cartIdsP]);
  const toPay = payable.lines.length;
  const counts = await hireFlowCounts(uid, toPay);
  // The strip counts what this page lists: people saved and not yet proposed to, who are still in the pool.
  // hireFlowCounts counts raw saved rows, which includes people who have since left the pool.
  const shortlisted = new Set(lines.filter((l) => !l.openProposalId && !l.acceptedProposalId).map((l) => l.candidate.id)).size;
  return { lines, currency, timezone, counts: { ...counts, shortlisted } };
}
