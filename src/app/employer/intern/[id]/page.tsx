import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  Award,
  BookOpen,
  GraduationCap,
  Laptop,
  Link2,
  MapPin,
  Send,
  UserRound,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  toCandidateProfile,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";

export const metadata: Metadata = {
  title: "Candidate",
  robots: { index: false, follow: false },
};

/**
 * A candidate, as one employer is allowed to see them.
 *
 * `canAccess(session, internId)` is the *wrong* check here and would be a bug:
 * it answers "is this user the intern", which is false for every employer, and
 * true for an admin. Visibility is a query instead — this employer sent them a
 * proposal and they responded. That is `requireVisibleToEmployer`'s
 * `isVisible` callback, expressed as a page.
 *
 * The candidate pool screen (`/employer/candidates`) is deliberately more
 * permissive — it shows name, score and skills for browsing. This page is the
 * one that opens up academics and courses, so it holds the stricter bar.
 */

export default async function EmployerInternDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const employerId = session!.uid;

  let profile: CandidateProfile | null = null;
  let appliedProjects: { id: string; projectName: string | null; status: string }[] = [];
  let currency: "INR" | "USD" = "INR";
  /** Set only when the check ran and passed. Distinct from a failed lookup. */
  let visible = false;
  /** True when a query could not run. Rendered, not hidden. */
  let lookupFailed = false;

  try {
    const db = getDb();

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isActive, true)))
      .limit(1);

    if (user) {
      // ── The cross-tenant check ────────────────────────────────────────────────
      // One query answers it: this employer's own proposals, addressed to this
      // intern. `canAccess` cannot — it compares the session uid against an
      // intern id, which is false for every employer and true for every admin.
      const proposals = await db
        .select({ projectId: schema.proposals.projectId, status: schema.proposals.status })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, employerId),
            eq(schema.proposals.internId, id),
          ),
        )
        .orderBy(desc(schema.proposals.createdAt));

      if (proposals.length > 0) {
        visible = true;

        // Collapse to one row per project, keeping the most recent status.
        const latest = new Map<string, string>();
        for (const proposal of proposals) {
          if (!latest.has(proposal.projectId)) latest.set(proposal.projectId, proposal.status);
        }

        const projectIds = Array.from(latest.keys());
        const projectRows = await db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          // Scoped to this employer too: a `project_id` on a proposal row is not
          // by itself proof the project belongs to them.
          .where(
            and(
              eq(schema.projects.employerId, employerId),
              inArray(schema.projects.id, projectIds),
            ),
          );
        const projectNameById = new Map(projectRows.map((row) => [row.id, row.projectName]));

        appliedProjects = projectIds.map((projectId) => ({
          id: projectId,
          projectName: projectNameById.get(projectId) ?? null,
          status: latest.get(projectId) ?? "sent",
        }));

        const [onboarding] = await db
          .select()
          .from(schema.internOnboarding)
          .where(eq(schema.internOnboarding.userId, user.id))
          .limit(1);

        profile = toCandidateProfile(user, onboarding);

        const [employer] = await db
          .select({ phoneNumber: schema.employers.phoneNumber })
          .from(schema.employers)
          .where(eq(schema.employers.id, employerId))
          .limit(1);
        currency = employer?.phoneNumber?.startsWith("91") ? "INR" : "USD";
      }
    }
  } catch {
    lookupFailed = true;
  }

  // A checked-and-denied intern gets the same 404 as an intern who does not
  // exist, so a valid id does not confirm the intern exists.
  if (!lookupFailed && !visible) notFound();

  // Reachable only when a query threw: a successful run either 404s above or
  // fills `profile`.
  if (!profile) {
    return (
      <div>
        <PageHeader title="Candidate" subtitle="Profile not available." />
        <EmptyState
          title="Could not load this profile"
          body={
            lookupFailed
              ? "The database is not reachable from this page right now. Nothing is wrong with the link — try again once the connection is back."
              : "That profile could not be assembled."
          }
        />
      </div>
    );
  }

  const band = bandFor(profile.score);
  const pricing = resolvePricing(profile.score, [], currency, null);
  const academics = profile.academics;

  return (
    <div>
      <Link
        href="/employer/candidates"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      <PageHeader title={profile.fullName} subtitle={profile.location || "Location not stated"} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <section className="rounded-xl border border-ink-100 bg-white p-6">
            <div className="flex flex-wrap items-start gap-5">
              <span
                aria-hidden
                className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700"
              >
                {profile.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                  Findtern Score
                </p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight text-ink-900">
                    {profile.scored ? profile.score.toFixed(1) : "—"}
                  </span>
                  <span className="text-sm text-text-subtle">/10</span>
                  <span className="ml-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {band.name}
                  </span>
                </p>
                <p className="mt-1.5 text-sm text-text-subtle">{band.blurb}</p>
              </div>
              <Link
                href={`/employer/send-proposal?intern=${encodeURIComponent(profile.id)}`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                <Send className="size-4" aria-hidden />
                Send proposal
              </Link>
            </div>

            {profile.skills.length > 0 ? (
              <div className="mt-6 border-t border-ink-100 pt-5">
                <h2 className="text-sm font-semibold text-ink-900">Skills &amp; tools</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-medium text-brand-700"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {profile.bio ? (
            <section className="rounded-xl border border-ink-100 bg-white p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <UserRound className="size-4 text-ink-400" aria-hidden />
                About
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {profile.bio}
              </p>
            </section>
          ) : null}

          <AiFeedbackReport
            candidateName={profile.fullName}
            findternScore={profile.score}
            ratings={profile.ratings}
            skills={profile.skills}
            bio={profile.bio}
          />

          {academics ? (
            <section className="rounded-xl border border-ink-100 bg-white p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <GraduationCap className="size-4 text-ink-400" aria-hidden />
                Academics
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Detail label="Institution">{academics.institution || "Not stated"}</Detail>
                <Detail label="Degree">
                  {[academics.degree, academics.specialization].filter(Boolean).join(", ") ||
                    "Not stated"}
                </Detail>
                <Detail label="Level">
                  {academics.level ? humanise(academics.level) : "Not stated"}
                </Detail>
                <Detail label="Years">
                  {[academics.startYear, academics.endYear].filter(Boolean).join(" – ") ||
                    "Not stated"}
                </Detail>
                <Detail label="Score">
                  {academics.score
                    ? `${academics.score}${academics.scoreType ? ` ${academics.scoreType}` : ""}`
                    : "Not stated"}
                </Detail>
                <Detail label="Status">{academics.status || "Not stated"}</Detail>
              </dl>
            </section>
          ) : null}

          {academics && academics.courses.length > 0 ? (
            <section className="rounded-xl border border-ink-100 bg-white p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <BookOpen className="size-4 text-ink-400" aria-hidden />
                Professional courses
              </h2>
              <ul className="mt-4 divide-y divide-ink-100">
                {academics.courses.map((course, i) => (
                  <li key={`${course.name}-${i}`} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-ink-900">{course.name}</p>
                    <p className="mt-0.5 text-xs text-text-subtle">
                      {[course.institution, course.level, course.completed, course.score]
                        .filter(Boolean)
                        .join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              <Award className="size-3.5" aria-hidden />
              What hiring them costs
            </p>
            <p className="mt-3 text-lg font-semibold tracking-tight text-ink-900">
              {formatRate(pricing.hourlyRateMinor, currency)}
            </p>
            <p className="mt-1 text-xs text-text-subtle">
              {pricing.perHireMinor > 0
                ? `plus ${formatRate(pricing.perHireMinor, currency)} per hire`
                : "no per-hire charge at this score"}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-ink-600">
              Fixed by the band, not negotiable in the composer. You set hours and can pay above
              the band.
            </p>
          </section>

          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Practicalities
            </p>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-700">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span>{profile.location || "Location not stated"}</span>
              </li>
              <li className="flex items-start gap-2">
                <Laptop className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span>
                  {profile.hasLaptop === null
                    ? "Has not said whether they have a laptop"
                    : profile.hasLaptop
                      ? "Has a laptop"
                      : "Needs one provided"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <UserRound className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span>
                  {profile.workModes.length > 0
                    ? `Open to ${profile.workModes.join(", ").toLowerCase()}`
                    : "No work mode stated"}
                </span>
              </li>
            </ul>
            {profile.preferredLocations.length > 0 ? (
              <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-text-subtle">
                Prefers: {profile.preferredLocations.join(", ")}
              </p>
            ) : null}
            {profile.linkedinUrl ? (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                <Link2 className="size-3.5" aria-hidden />
                LinkedIn profile
              </a>
            ) : null}
          </section>

          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Your proposals to them
            </p>
            <ul className="mt-3 space-y-2.5">
              {appliedProjects.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="font-medium text-ink-900">
                    {entry.projectName ?? "Project no longer listed"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-subtle capitalize">
                    {entry.status.replace(/_/g, " ")}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-relaxed text-text-subtle">
              You can see this profile because you sent them a proposal. It is not in the open
              candidate pool.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}
