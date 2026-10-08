import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/marketing/page-hero";
import { RoleCard } from "@/components/marketing/role-card";
import { ButtonLink } from "@/components/ui/button";
import { openProjects } from "@/lib/intern-data";

export const metadata: Metadata = {
  title: "Open internships and roles",
  description:
    "Every role currently open on Findtern. Browse the brief, the skills and the company without an account.",
  alternates: { canonical: "/opportunities" },
};

/**
 * Public role browser.
 *
 * The legacy site let anyone browse `/opportunities` — that was the top of the
 * funnel, and a cold visitor from a search result or an ad lands here before
 * they have any reason to make an account. The rewrite put this list inside the
 * signed-in intern area, where a guest got a redirect to sign in, so the
 * funnel had a locked door at the top.
 *
 * Nothing here needs an account: `openProjects()` reads project rows and the
 * company name, both of which the marketing site already publishes. What a
 * guest cannot do is register interest, so the page says so rather than
 * pretending — the same rule the whole redesign follows.
 */
export default async function PublicOpportunities() {
  const rows = await openProjects(60);

  return (
    <div>
      <PageHero
        eyebrow="Open roles"
        title="Everything hiring on Findtern right now."
        lead="Each listing is a live project a company has opened this month. Read the whole brief, then decide whether it is worth an account."
      />

      <section className="container-page section-y">
        {rows.length === 0 ? (
          <div className="mx-auto max-w-xl text-center">
            <p className="text-pretty text-base leading-relaxed text-ink-600">
              No roles are open at the moment. Companies post projects as they open them, and this
              list fills up regularly — creating a profile first is what puts you in front of the
              ones that appear next week.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/signup" variant="primary" size="lg">
                Create a free profile
              </ButtonLink>
              <ButtonLink href="/interns" variant="outline" size="lg">
                How it works
              </ButtonLink>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-500">
              {rows.length} role{rows.length === 1 ? "" : "s"} open
            </p>
            <ul className="grid gap-3 lg:grid-cols-2">
              {rows.map((role) => (
                <li key={role.id}>
                  <RoleCard role={role} />
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <h2 className="text-pretty text-lg font-semibold tracking-[-0.015em] text-ink-900">
                    Companies here search for candidates — they do not collect applications.
                  </h2>
                  <p className="mt-2 max-w-prose text-pretty text-sm leading-relaxed text-ink-600">
                    What gets you seen is a complete profile and a Findtern Score from the AI
                    interview. Creating the profile is free; the interview is a one-time payment once
                    you decide to go live. Nothing here sends you an application form, and no company
                    can contact you directly until you accept an offer.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 sm:justify-end">
                  <ButtonLink href="/signup" variant="primary" size="lg">
                    Create a free profile
                  </ButtonLink>
                  <ButtonLink href="/interns" variant="outline" size="lg">
                    How hiring works
                  </ButtonLink>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-ink-500">
              Already have an account?{" "}
              <Link
                href="/intern/opportunities"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                See the roles you have been considered for
              </Link>
              .
            </p>
          </>
        )}
      </section>
    </div>
  );
}