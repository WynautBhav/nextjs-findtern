import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { requireRole } from "@/lib/auth";
import { isAdminViewing } from "@/lib/employer-visibility";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  displayNameOf,
  toCandidateProfile,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { employerRegion, resolvePricing } from "@/lib/employer-pricing";
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
 * true for an admin. Visibility is a query instead - this employer sent them a
 * proposal and they responded. That is `requireVisibleToEmployer`'s
 * `isVisible` callback, expressed as a page.
 *
 * The candidate pool screen (`/employer/candidates`) is deliberately more
 * permissive - it shows initials, score and skills for browsing. This page is the
 * one that opens up academics and courses, so it holds the stricter bar.
 *
 * Names (and LinkedIn, which leaks the name) stay redacted until this employer
 * hires the intern - see `displayNameOf` in `lib/employer-candidates`.
 */

export default async function EmployerInternDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("employer");
  const employerId = session.uid;

  let profile: CandidateProfile | null = null;
  let appliedProjects: { id: string; projectName: string | null; status: string }[] = [];
  let currency: "INR" | "USD" = "INR";
  /** Full name + LinkedIn show only after this employer hired the intern. */
  let nameUnlocked = false;
  /** Admin "View as" only: the candidate's own contact details. */
  let adminContact: { email: string; phone: string } | null = null;
  /** Set only when the check ran and passed. Distinct from a failed lookup. */
  let visible = false;
  /** True when a query could not run. Rendered, not hidden. */
  let lookupFailed = false;
  /** The employer's newest active project and whether this candidate is on its shortlist. */
  let shortlist: { projectId: string; on: boolean } | null = null;

  try {
    const db = getDb();

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isActive, true)))
      .limit(1);

    if (user) {
      visible = true;
      const adminViewing = await isAdminViewing();
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.employerId, employerId), eq(schema.projects.status, "active")))
        .orderBy(desc(schema.projects.createdAt))
        .limit(1);
      if (project) {
        const [item] = await db
          .select({ id: schema.employerCartItems.id })
          .from(schema.employerCartItems)
          .where(
            and(
              eq(schema.employerCartItems.employerId, employerId),
              eq(schema.employerCartItems.internId, id),
              eq(schema.employerCartItems.projectId, project.id),
            ),
          )
          .limit(1);
        shortlist = { projectId: project.id, on: Boolean(item) };
      }
      // One view per employer per day feeds the intern's monthly views summary.
      if (!adminViewing) {
        await db.execute(sql`
          INSERT INTO profile_views (employer_id, intern_id)
          SELECT ${employerId}, ${id}
          WHERE NOT EXISTS (
            SELECT 1 FROM profile_views WHERE employer_id = ${employerId} AND intern_id = ${id}
              AND created_at > now() - interval '1 day'
          )`);
      }
      if (adminViewing) {
        nameUnlocked = true;
        adminContact = {
          email: user.email,
          phone: `${user.countryCode ?? ""} ${user.phoneNumber ?? ""}`.trim(),
        };
      }

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
        // Redaction lifts only on hire - sent / accepted / in-cart stays initials.
        nameUnlocked = nameUnlocked || proposals.some((proposal) => proposal.status === "hired");

        // Collapse to one row per project, keeping the most recent status.
        const latest = new Map<string, string>();
        for (const proposal of proposals) {
          if (!latest.has(proposal.projectId)) latest.set(proposal.projectId, proposal.status);
        }

        const projectIds = Array.from(latest.keys());
        const projectRows = await db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
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
      }

      const [onboarding] = await db
        .select()
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, user.id))
        .limit(1);

      profile = toCandidateProfile(user, onboarding);

      const [employer] = await db
        .select({
          country: schema.employers.country,
          countryCode: schema.employers.countryCode,
          phoneNumber: schema.employers.phoneNumber,
        })
        .from(schema.employers)
        .where(eq(schema.employers.id, employerId))
        .limit(1);
      currency = employerRegion(employer ?? {}) === "IN" ? "INR" : "USD";
    }
  } catch {
    lookupFailed = true;
  }

  // A candidate who does not exist gets a 404.
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
              ? "We couldn't load this profile right now. Nothing is wrong with the link - try again in a moment."
              : "That profile could not be assembled."
          }
        />
      </div>
    );
  }

  const band = bandFor(profile.score);
  const pricing = resolvePricing(profile.score, [], currency, null);
  const academics = profile.academics;
  const displayName = displayNameOf(profile, nameUnlocked);

  return (
    <div>
      <Link
        href="/employer/candidates"
        className="apple-spring inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      <PageHeader title={displayName} subtitle={profile.location || "Location not stated"} />
      {adminContact ? (
        <p className="mb-4 rounded-[10px] border border-accent-300 bg-accent-100/60 px-4 py-2.5 text-sm text-ink-800">
          <span className="font-semibold">Admin view:</span>{" "}
          <a href={`mailto:${adminContact.email}`} className="underline underline-offset-4">
            {adminContact.email}
          </a>
          {adminContact.phone ? <> · {adminContact.phone}</> : null}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <div className="flex flex-wrap items-start gap-5">
              <span
                aria-hidden
                className="grid size-16 shrink-0 place-items-center rounded-[10px] bg-brand-100 text-xl font-semibold tabular-nums text-brand-700"
              >
                {profile.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                  Findtern Score
                </p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tabular-nums tracking-tight text-ink-900">
                    {profile.scored ? profile.score.toFixed(1) : "-"}
                  </span>
                  <span className="text-sm tabular-nums text-text-subtle">/10</span>
                  <span className="ml-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {band.name}
                  </span>
                </p>
                <p className="mt-1.5 text-sm text-text-subtle">{band.blurb}</p>
              </div>
              <Link
                href={`/employer/send-proposal?intern=${encodeURIComponent(profile.id)}`}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Send className="size-4" aria-hidden />
                Send proposal
              </Link>
            </div>
            {shortlist ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ShortlistToggle internId={profile.id} projectId={shortlist.projectId} shortlisted={shortlist.on} />
                <Link href="/employer/cart" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                  Book an interview from your shortlist
                </Link>
              </div>
            ) : null}

            {profile.skills.length > 0 ? (
              <div className="mt-6 border-t border-ink-100 pt-5">
                <h2 className="text-sm font-semibold text-ink-900">Skills &amp; tools</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {profile.bio ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
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
            candidateName={displayName}
            findternScore={profile.score}
            ratings={profile.ratings}
            skills={profile.skills}
            bio={profile.bio}
            aiFeedbackLink={profile.aiFeedbackLink}
            aiRecordingLink={profile.aiRecordingLink}
          />

          {academics ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
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
                <Detail label="Status">{academics.status ? humanise(academics.status) : "Not stated"}</Detail>
              </dl>
            </section>
          ) : null}

          {academics && academics.courses.length > 0 ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <BookOpen className="size-4 text-ink-400" aria-hidden />
                Professional courses
              </h2>
                <ul className="mt-4 divide-y divide-ink-100">
                {academics.courses.map((course, i) => (
                  <li key={`${course.name}-${i}`} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-ink-900">{course.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-text-subtle">
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

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              <Award className="size-3.5" aria-hidden />
              What hiring them costs
            </p>
            <p className="mt-3 text-lg font-semibold tabular-nums tracking-tight text-ink-900">
              {formatRate(pricing.hourlyRateMinor, currency)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-text-subtle">
              plus {formatRate(pricing.perHireMinor, currency)} per hire
            </p>
            <p className="mt-4 text-xs leading-relaxed text-ink-600">
              Fixed by the band, not negotiable in the composer. You set hours and can pay above
              the band.
            </p>
          </section>

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
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
            {/* LinkedIn URLs usually contain the real name, so the link stays
                hidden until the hire unmasks the candidate. */}
            {nameUnlocked && profile.linkedinUrl ? (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="apple-spring mt-3 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                <Link2 className="size-3.5" aria-hidden />
                LinkedIn profile
              </a>
            ) : null}
          </section>

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Your proposals to them
            </p>
            <ul className="mt-3 space-y-2.5">
              {appliedProjects.map((entry) => (
                <li key={entry.id} className="min-w-0 text-sm">
                  <p className="font-medium text-ink-900">
                    {entry.projectName ?? "Project no longer listed"}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-text-subtle">
                    {humanise(entry.status)}
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
    <div className="min-w-0">
      <dt className="text-xs tabular-nums text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-ink-900">{children}</dd>
    </div>
  );
}

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}
