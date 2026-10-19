import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canEmployerSeeIntern } from "@/lib/employer-pool";
import { displayNameOf, toCandidateProfile, type CandidateSummary } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { employerRegion, resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { SendProposalForm } from "@/components/employer/send-proposal-form";
import { ButtonLink } from "@/components/ui/button";

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
  searchParams: Promise<{ intern?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  const { intern: internParam } = await searchParams;
  const internId = (Array.isArray(internParam) ? internParam[0] : internParam)?.trim() ?? "";

  let projects: ProjectOption[] = [];
  let candidate: CandidateSummary | null = null;
  let pricing: Record<Currency, Pricing>;
  let currency: Currency = "INR";
  let hasPlans = false;

  try {
    const db = getDb();

    const rows = await db
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        skills: schema.projects.skills,
        locationType: schema.projects.locationType,
        timezone: schema.projects.timezone,
      })
      .from(schema.projects)
      .where(eq(schema.projects.employerId, uid));
    projects = rows.map((row) => ({
      ...row,
      skills: Array.isArray(row.skills) ? row.skills.filter(Boolean) : [],
    }));

    const [employer] = await db
      .select({
        country: schema.employers.country,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
      })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);

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
        let unlocked = false;
        try {
          unlocked = (await hiredInternIds(db, uid)).has(user.id);
        } catch {
          unlocked = false;
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
  } catch {
    // DB unavailable - the page still explains itself and links to the browser.
    pricing = {
      INR: resolvePricing(0, [], "INR", null),
      USD: resolvePricing(0, [], "USD", null),
    };
  }

  if (!internId || !candidate) {
    return (
      <div>
        <PageHeader
          title="Send a proposal"
          subtitle="Pick a candidate first - the offer is built around their Findtern Score."
        />
        <EmptyState
          title="No candidate selected"
          body="Open a candidate from the browser and use Send proposal on their row to start an offer."
          action={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - pick a candidate first"
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink
            href="/employer/projects"
            variant="outline"
            size="sm"
            className="min-h-11 px-4 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Your projects
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
        className="apple-spring inline-flex min-h-11 items-center gap-1.5 rounded-[10px] text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {candidate.name}
      </Link>

      <PageHeader
        title="Send a proposal"
        subtitle="Compensation is derived from the Findtern Score band, not typed in."
      />

      <SendProposalForm
        candidate={candidate}
        projects={projects}
        pricing={pricing}
        defaultCurrency={currency}
        rateCardSource={hasPlans ? "plan" : "default"}
        employerId={uid}
        internId={internId}
      />
    </div>
  );
}
