import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { canEmployerSeeIntern } from "@/lib/employer-pool";
import { displayNameOf, toCandidateProfile, type CandidateSummary } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { EmptyScene, PageHead, Pill, Surface } from "@/components/app/primitives";
import { offerState } from "@/components/employer/proposal-state";
import { parseOffer } from "@/lib/offer";
import { isProjectOpen } from "@/lib/project-locations";
import { SendProposalForm } from "@/components/employer/send-proposal-form";
import { timezoneForLocation } from "@/lib/timezones";
import { workPreferenceOf, type WorkPreference } from "@/lib/work-preference";
import { ButtonLink, buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Send a proposal",
  robots: { index: false, follow: false },
};

type ProjectOption = {
  id: string;
  projectName: string;
  skills: string[];
  locationType: string | null;
  timezone: string | null;
};

/**
 * Proposal composer.
 *
 * The legacy page was 1,367 lines: a candidate search dialog, a Quill editor, a
 * timezone fetch against a public time API, a live price recompute, and the
 * form. Everything but the form is gone or belongs on the candidate browser, so
 * what remains is the form plus a derived price panel.
 *
 * The candidate arrives as `?intern=<id>`. Without one (or for someone outside
 * the pool with no relationship to this employer) the page says so instead of
 * rendering a form that cannot be filled in.
 */

export default async function SendProposal({
  searchParams,
}: {
  searchParams: Promise<{ intern?: string | string[]; project?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;
  const { intern: internParam, project: projectParam } = await searchParams;
  const internId = (Array.isArray(internParam) ? internParam[0] : internParam)?.trim() ?? "";
  const projectId = (Array.isArray(projectParam) ? projectParam[0] : projectParam)?.trim() ?? "";

  let projects: ProjectOption[] = [];
  let candidate: CandidateSummary | null = null;
  let preference: WorkPreference = { modes: [], cities: [] };
  let pricing: Record<Currency, Pricing>;
  let currency: Currency = "INR";
  let companyTimezone = "Asia/Kolkata";
  let hasPlans = false;
  let hasLaptop: boolean | null = null;
  // An offer already live with this candidate (any project): said up front,
  // not after the form is filled (legacy; EMH-16). A hire blocks too (EMB-26).
  let existing: { id: string; label: string; hired: boolean; fullTime: boolean } | null = null;
  let loadFailed = false;

  try {
    const db = getDb();

    const rows = await db
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        skills: schema.projects.skills,
        locationType: schema.projects.locationType,
        timezone: schema.projects.timezone,
        status: schema.projects.status,
      })
      .from(schema.projects)
      .where(eq(schema.projects.employerId, uid))
      .orderBy(desc(schema.projects.createdAt));
    // Open projects only, newest first; the default is the newest open one
    // (legacy picker; EMH-15). Closed covers closed/inactive/archived (EMH-03).
    projects = rows.filter((row) => isProjectOpen(row.status)).map((row) => ({
      id: row.id,
      projectName: row.projectName,
      locationType: row.locationType,
      timezone: row.timezone,
      skills: Array.isArray(row.skills) ? row.skills.filter(Boolean) : [],
    }));

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
    companyTimezone = timezoneForLocation(employer ?? {});

    // A +91 country code is the legacy signal for an India-based employer; the
    // legacy client used the same inference (inferEmployerIsIndia).
    const region: "IN" | null = employerRegion(employer ?? {});
    currency = region === "IN" ? "INR" : "USD";

    let score = 0;
    if (internId) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.id, internId), eq(schema.users.isActive, true), eq(schema.users.role, "intern")))
        .limit(1);

      if (user && (await canEmployerSeeIntern(db, uid, user.id))) {
        const [onboarding] = await db
          .select()
          .from(schema.internOnboarding)
          .where(eq(schema.internOnboarding.userId, user.id))
          .limit(1);

        const profile = toCandidateProfile(user, onboarding);
        preference = workPreferenceOf(onboarding);
        let unlocked = false;
        try {
          unlocked = (await hiredInternIds(db, uid)).has(user.id);
        } catch {
          unlocked = false;
        }
        hasLaptop = profile.hasLaptop;
        const mine = await db
          .select({
            id: schema.proposals.id,
            status: schema.proposals.status,
            hiredAt: schema.proposals.hiredAt,
            offerDetails: schema.proposals.offerDetails,
            currency: schema.proposals.currency,
          })
          .from(schema.proposals)
          .where(
            and(
              eq(schema.proposals.employerId, uid),
              eq(schema.proposals.internId, user.id),
              inArray(schema.proposals.status, ["draft", "sent", "interview_scheduled", "accepted", "processing", "hired"]),
            ),
          );
        for (const row of mine) {
          const offer = parseOffer(row.offerDetails, row.currency);
          const st = offerState(row, offer);
          if (st.lapsed) continue;
          const hired = row.status === "hired" || Boolean(row.hiredAt);
          if (!existing || hired) existing = { id: row.id, label: st.label, hired, fullTime: Boolean(offer.fullTime) };
        }
        candidate = {
          id: profile.id,
          name: displayNameOf(profile, unlocked),
          initials: profile.initials,
          location: profile.location,
          score: profile.score,
          scored: profile.scored,
          skills: profile.skills,
          ratings: profile.ratings,
        };
        score = profile.score;
      }
    }

    let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
    try {
      plans = await db
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.isActive, true));
      hasPlans = plans.length > 0;
    } catch {
      // No rate card in this environment. `resolvePricing` falls back to the
      // published bands, so this is not a failure path worth surfacing.
    }

    pricing = {
      INR: resolvePricing(score, plans, "INR", region),
      USD: resolvePricing(score, plans, "USD", region),
    };
  } catch (err) {
    console.error("[employer/send-proposal] load failed", err);
    loadFailed = true;
    pricing = {
      INR: resolvePricing(0, [], "INR", null),
      USD: resolvePricing(0, [], "USD", null),
    };
  }

  if (loadFailed) {
    return (
      <div>
        <PageHead title="Send a proposal" />
        <EmptyScene
          art
          title="Couldn't load this offer"
          body="We couldn't reach your projects or this candidate right now. Nothing was sent. Reload the page in a moment."
          who="Us - a connection problem"
        />
      </div>
    );
  }

  if (!internId || !candidate) {
    return (
      <div>
        <PageHead title="Send a proposal" lede="Pick a candidate first. The offer is built around their Findtern Score." />
        <EmptyScene
          title="No candidate selected"
          body="Open a candidate from the browser and use Send proposal on their card to start an offer."
          next={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - pick a candidate first"
        />
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/employer/cart" variant="ghost" size="sm">
            Open your shortlist
          </ButtonLink>
        </div>
      </div>
    );
  }

  const back = (
    <Link
      href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
      className="apple-spring mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {candidate.name}
    </Link>
  );

  if (existing) {
    return (
      <div>
        {back}
        <PageHead title="Send a proposal" />
        <Surface className="max-w-2xl p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink-900">
              {existing.hired ? "Already hired" : "Proposal already sent"}
            </h2>
            <Pill tone={existing.hired ? "live" : "waiting"}>{existing.label}</Pill>
          </div>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-700">
            {existing.hired
              ? `${candidate.name} already works with you, so a second internship offer isn't possible. Their placement is on Orders.`
              : `${candidate.name} already has a live offer from you. One offer per candidate: edit or withdraw that one before sending another.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/employer/proposal/${encodeURIComponent(existing.id)}`} className={buttonClass({ size: "sm" })}>
              View the {existing.fullTime ? "offer" : "proposal"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            {existing.hired ? (
              <Link href="/employer/orders" className={buttonClass({ variant: "outline", size: "sm" })}>
                Orders
              </Link>
            ) : null}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div>
      {back}
      <PageHead
        title="Send a proposal"
        lede="Pay follows the candidate's Findtern Score band. Nothing is charged until they accept."
      />

      <SendProposalForm
        candidate={candidate}
        projects={projects}
        pricing={pricing}
        defaultCurrency={currency}
        rateCardSource={hasPlans ? "plan" : "default"}
        employerId={uid}
        internId={internId}
        initialProjectId={projectId}
        preference={preference}
        companyTimezone={companyTimezone}
        candidateHasLaptop={hasLaptop}
      />
    </div>
  );
}
