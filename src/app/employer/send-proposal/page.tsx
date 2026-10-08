import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, UserRound } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toCandidateProfile, type CandidateSummary } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { SendProposalForm } from "@/components/employer/send-proposal-form";

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
 * The candidate arrives as `?intern=<id>`. Without one the page says so instead
 * of rendering a form that cannot be filled in.
 *
 * There is no `POST /api/employer/:id/proposals` in this build — the form says
 * so on submit rather than posting into the void.
 */

export default async function SendProposal({
  searchParams,
}: {
  searchParams: Promise<{ intern?: string | string[] }>;
}) {
  const session = await getSession();
  const uid = session!.uid;
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
      .select({ country: schema.employers.country, phoneNumber: schema.employers.phoneNumber })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);

    // A +91 country code is the legacy signal for an India-based employer; the
    // legacy client used the same inference (inferEmployerIsIndia).
    const region: "IN" | null = employer?.phoneNumber?.startsWith("91") ? "IN" : null;
    currency = region === "IN" ? "INR" : "USD";

    let score = 0;
    if (internId) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.id, internId), eq(schema.users.isActive, true)))
        .limit(1);

      if (user) {
        const [onboarding] = await db
          .select()
          .from(schema.internOnboarding)
          .where(eq(schema.internOnboarding.userId, user.id))
          .limit(1);

        const profile = toCandidateProfile(user, onboarding);
        candidate = {
          id: profile.id,
          name: profile.fullName,
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
    // DB unavailable — the page still explains itself and links to the browser.
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
          subtitle="Pick a candidate first — the offer is built around their Findtern Score."
        />
        <EmptyState
          title="No candidate selected"
          body="Open a candidate from the browser and use Send proposal on their row. This URL needs an ?intern=<id> query to render the form."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/employer/candidates"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            <UserRound className="size-4" aria-hidden />
            Browse candidates
          </Link>
          <Link
            href="/employer/projects"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Your projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:underline"
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
