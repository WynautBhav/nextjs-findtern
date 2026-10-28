import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ArrowLeft, Laptop, Link2, MapPin, Send } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { candidateRelations, isAdminViewing, type CandidateRelation } from "@/lib/employer-visibility";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { bandFor } from "@/lib/score";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { displayNameOf, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { employerRegion, resolvePricing } from "@/lib/employer-pricing";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { candidateStatusPill } from "@/components/employer/candidate-status";
import { CompareToggle } from "@/components/employer/compare-toggle";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { attachPhotos, canEmployerSeeIntern } from "@/lib/employer-pool";
import { isBlockingInterview } from "@/lib/employer-interview-rules";
import { notify } from "@/lib/notify";
import { isOpenProject, rememberedSelection } from "@/lib/employer-selection";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { parseOffer } from "@/lib/offer";
import { timezoneForLocation } from "@/lib/timezones";
import { dateLabel, draftFromRecord, type OnboardingDraft } from "@/lib/onboarding";
import { employerProposalPill } from "@/components/app/status";
import { DetailRow, EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Candidate",
  robots: { index: false, follow: false },
};

/**
 * A candidate, as one employer is allowed to see them.
 *
 * Visible when the intern is in the candidate pool today (`candidatePoolClauses`:
 * live, open to work, AI-interviewed, approved) or is committed to this
 * employer (offer accepted, being paid for, or hired). An intern who switched
 * off open-to-work disappears for everyone else, as on legacy (bug sheet r134).
 *
 * Names, photo and LinkedIn stay redacted until this employer hires the
 * intern - see `displayNameOf` in `lib/employer-candidates`.
 */

/** What the "Send proposal" control should do for this candidate. */
type ProposalAction =
  | { kind: "send" }
  | { kind: "view"; proposalId: string }
  | { kind: "blocked"; reason: string };

export default async function EmployerInternDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { id } = await params;
  const { project: requestedProject } = await searchParams;
  const session = await requireRole("employer");
  const employerId = session.uid;

  let profile: CandidateProfile | null = null;
  let appliedProjects: { id: string; projectName: string | null; status: string }[] = [];
  let currency: "INR" | "USD" = "INR";
  let region: "IN" | null = null;
  /** Full name, photo and LinkedIn show only after this employer hired the intern. */
  let nameUnlocked = false;
  /** Admin "View as" only: the candidate's own contact details. */
  let adminContact: { email: string; phone: string } | null = null;
  /** Set only when the check ran and passed. Distinct from a failed lookup. */
  let visible = false;
  /** True when a query could not run. Rendered, not hidden. */
  let lookupFailed = false;
  /** The selected (or newest open) project and whether this candidate is on its shortlist. */
  let shortlist: { projectId: string; on: boolean } | null = null;
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  let action: ProposalAction = { kind: "send" };
  let details: Partial<OnboardingDraft> = {};
  let relation: CandidateRelation | null = null;
  let comparePicks: string[] = [];
  let employerFte = "none";
  let employerZone = "Asia/Kolkata";

  try {
    const db = getDb();

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isActive, true), eq(schema.users.role, "intern")))
      .limit(1);

    const adminViewing = await isAdminViewing();
    if (user && (adminViewing || (await canEmployerSeeIntern(db, employerId, id)))) {
      visible = true;
      const remembered = await rememberedSelection(employerId);
      comparePicks = remembered.compare;
      // `?project=` keeps the shortlist on the project the employer was
      // browsing; then the one picked on the candidates page; then the
      // newest open one (EMH-15).
      const projectRows = (
        await db
          .select({ id: schema.projects.id, status: schema.projects.status })
          .from(schema.projects)
          .where(eq(schema.projects.employerId, employerId))
          .orderBy(desc(schema.projects.createdAt))
      ).filter((row) => isOpenProject(row.status));
      const project =
        projectRows.find((row) => row.id === requestedProject) ??
        projectRows.find((row) => row.id === remembered.project) ??
        projectRows[0];
      if (project) {
        const [item] = await db
          .select({ id: schema.employerCartItems.id })
          .from(schema.employerCartItems)
          .where(
            and(
              eq(schema.employerCartItems.employerId, employerId),
              eq(schema.employerCartItems.internId, id),
              eq(schema.employerCartItems.projectId, project.id),
              eq(schema.employerCartItems.listType, "cart"),
            ),
          )
          .limit(1);
        shortlist = { projectId: project.id, on: Boolean(item) };
      }
      // One view per employer per day feeds the intern's monthly views summary,
      // and tells the intern (legacy "Spotlight" notice, once per employer/day).
      if (!adminViewing) {
        const recorded = await db.execute(sql`
          INSERT INTO profile_views (employer_id, intern_id)
          SELECT ${employerId}, ${id}
          WHERE NOT EXISTS (
            SELECT 1 FROM profile_views WHERE employer_id = ${employerId} AND intern_id = ${id}
              AND created_at > now() - interval '1 day'
          )
          RETURNING id`);
        if (recorded.rows.length > 0) {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const [{ views }] = await db
            .select({ views: sql<number>`count(*)::int` })
            .from(schema.profileViews)
            .where(and(eq(schema.profileViews.internId, id), gte(schema.profileViews.createdAt, monthStart)));
          const name = (user.firstName ?? "").trim();
          await notify({
            to: { type: "intern", id },
            type: "profile_view",
            title: "Profile viewed",
            message: `🚀 Spotlight's on you${name ? `, ${name}` : ""} - ${views} profile view${views === 1 ? "" : "s"} and counting!`,
            data: { employerId, monthViews: views },
            dedupeKey: `profile_view:${id}:${employerId}:${now.toISOString().slice(0, 10)}`,
          }).catch((e) => console.error("[employer/intern] view notice", e));
        }
      }
      if (adminViewing) {
        nameUnlocked = true;
        adminContact = {
          email: user.email,
          phone: `${user.countryCode ?? ""} ${user.phoneNumber ?? ""}`.trim(),
        };
      }

      const proposals = await db
        .select({
          id: schema.proposals.id,
          projectId: schema.proposals.projectId,
          status: schema.proposals.status,
          offerDetails: schema.proposals.offerDetails,
          currency: schema.proposals.currency,
        })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, id)))
        .orderBy(desc(schema.proposals.createdAt));
      relation = (await candidateRelations(db, employerId, [id])).get(id) ?? null;

      if (proposals.length > 0) {
        // Redaction lifts only on hire - sent / accepted / in-cart stays initials.
        nameUnlocked = nameUnlocked || Boolean(relation?.hired);

        // Collapse to one row per project, keeping the most recent status.
        const latest = new Map<string, string>();
        for (const proposal of proposals) {
          if (!latest.has(proposal.projectId)) latest.set(proposal.projectId, proposal.status);
        }
        const projectIds = Array.from(latest.keys());
        const named = await db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          .where(and(eq(schema.projects.employerId, employerId), inArray(schema.projects.id, projectIds)));
        const projectNameById = new Map(named.map((row) => [row.id, row.projectName]));
        appliedProjects = projectIds.map((projectId) => ({
          id: projectId,
          projectName: projectNameById.get(projectId) ?? null,
          status: latest.get(projectId) ?? "sent",
        }));
      }

      // Same conditions legacy used to disable "Send proposal" (detail:1049).
      const interviews = await db
        .select()
        .from(schema.interviews)
        .where(and(eq(schema.interviews.employerId, employerId), eq(schema.interviews.internId, id)));
      const CLOSED = ["rejected", "withdrawn", "expired"];
      // One live offer per candidate across all projects (the send route
      // enforces it), so an open offer on any project is "View proposal".
      const isOpen = (p: (typeof proposals)[number]) => !CLOSED.includes(p.status) && p.status !== "hired";
      const openForProject = proposals.find((p) => p.projectId === project?.id && isOpen(p)) ?? proposals.find(isOpen);
      if (relation?.hired) {
        // EMB-26: hired on any project locks the candidate for a second internship.
        action = { kind: "blocked", reason: "Already hired. See Orders for the placement." };
      } else if (proposals.some((p) => !CLOSED.includes(p.status) && parseOffer(p.offerDetails, p.currency).fullTime)) {
        action = { kind: "blocked", reason: "A full-time offer is already out." };
      } else if (openForProject) {
        action = { kind: "view", proposalId: openForProject.id };
      } else if (interviews.some((iv) => (!project || !iv.projectId || iv.projectId === project.id) && isBlockingInterview(iv))) {
        action = { kind: "blocked", reason: "Finish the booked interview first." };
      }

      const [onboarding] = await db
        .select()
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, user.id))
        .orderBy(desc(schema.internOnboarding.updatedAt))
        .limit(1);

      profile = toCandidateProfile(user, onboarding);
      // Photo follows the name: initials until hired (bug sheet NC r41).
      await attachPhotos(db, [profile], { has: () => nameUnlocked });
      if (onboarding) details = draftFromRecord(onboarding);
      plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));

      const [employer] = await db
        .select({
          country: schema.employers.country,
          state: schema.employers.state,
          countryCode: schema.employers.countryCode,
          phoneNumber: schema.employers.phoneNumber,
          fteStatus: schema.employers.internationalFteStatus,
        })
        .from(schema.employers)
        .where(eq(schema.employers.id, employerId))
        .limit(1);
      region = employerRegion(employer ?? {});
      currency = region === "IN" ? "INR" : "USD";
      employerFte = employer?.fteStatus ?? "none";
      employerZone = timezoneForLocation(employer ?? {});
    }
  } catch (err) {
    console.error("[employer/intern] load failed", err);
    lookupFailed = true;
  }

  // Not in the pool and no relationship with this employer: 404.
  if (!lookupFailed && !visible) notFound();

  // Reachable only when a query threw: a successful run either 404s above or
  // fills `profile`.
  if (!profile) {
    return (
      <div>
        <PageHead title="Candidate" />
        <EmptyScene
          art
          title="Couldn't load this profile"
          body="Something went wrong on our side. The link is fine; try again in a moment."
          next={{ label: "Try again", href: `/employer/intern/${encodeURIComponent(id)}` }}
          who="Us - we're on it"
        />
      </div>
    );
  }

  const aiLinks = await aiInterviewLinks(profile.id, {
    aiFeedbackLink: profile.aiFeedbackLink,
    aiRecordingLink: profile.aiRecordingLink,
  });
  const band = bandFor(profile.score);
  const pricing = resolvePricing(profile.score, plans, currency, region);
  const experiences = (details.experiences ?? []).filter((e) => e.company || e.role);
  const qualifications = [...(details.academics?.professional ?? []), ...(details.academics?.certifications ?? [])].filter((q) => q.name);
  const languages = (details.languages ?? []).filter((l) => l.language);
  const activities = (details.extracurriculars ?? []).filter((a) => a.activity);
  const academics = profile.academics;
  const displayName = displayNameOf(profile, nameUnlocked);
  const status = candidateStatusPill(relation?.proposal ?? null);
  const compareBlocked = relation?.hired
    ? "Hired - not compared"
    : relation?.proposal?.fullTime
      ? "Full-time offer out"
      : null;

  return (
    <div>
      <Link
        href="/employer/candidates"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      {adminContact ? (
        <p className="mb-4 rounded-apple-md border border-accent-300 bg-accent-100/60 px-4 py-2.5 text-sm text-ink-800">
          <span className="font-semibold">Admin view:</span>{" "}
          <a href={`mailto:${adminContact.email}`} className="underline underline-offset-4">
            {adminContact.email}
          </a>
          {adminContact.phone ? <> · {adminContact.phone}</> : null}
        </p>
      ) : null}

      {/* ── Identity and the score, the one thing an employer decides on ── */}
      <Surface className="mb-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
          <div className="flex min-w-0 flex-1 basis-80 items-start gap-5">
            <CandidateAvatar
              photoUrl={profile.photoUrl}
              initials={profile.initials}
              className="size-16 rounded-apple-lg text-xl ring-1 ring-inset ring-brand-200/70"
            />
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold leading-tight tracking-[-0.025em] text-ink-900">{displayName}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-ink-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-ink-400" aria-hidden />
                  {profile.location || "Location not stated"}
                </span>
                {profile.hasLaptop !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Laptop className="size-4 text-ink-400" aria-hidden />
                    {profile.hasLaptop ? "Has a laptop" : "Needs a laptop"}
                  </span>
                ) : null}
              </p>
              {profile.workModes.length > 0 ? <p className="mt-1 text-sm text-ink-600">Open to {profile.workModes.join(", ").toLowerCase()}</p> : null}
              {status ? (
                <div className="mt-3">
                  <Pill tone={status.tone}>{status.label}</Pill>
                </div>
              ) : null}
            </div>
          </div>

          {/* Not shrink-0 on phones: the price line set the block's width and
              ran to x=460 on a 375 screen (QA-119). It wraps instead. */}
          <div className="flex min-w-0 gap-8 sm:shrink-0">
            <div className="shrink-0">
              <p className="text-sm font-medium text-ink-600">Findtern Score</p>
              <p className="nums mt-1 text-4xl font-semibold leading-none tracking-[-0.03em] text-brand-700">
                {profile.scored ? profile.score.toFixed(1) : "-"}
                <span className="ml-0.5 text-base font-medium text-text-subtle">/10</span>
              </p>
              <p className="mt-1.5 text-sm text-ink-600">{band.name}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-600">Price</p>
              <p className="nums mt-2.5 text-2xl font-semibold leading-none tracking-[-0.02em] text-ink-900">
                {formatRate(pricing.hourlyRateMinor, currency)}
              </p>
              <p className="mt-2.5 text-sm text-ink-600">
                {/* The price is said once, here: no separate "what hiring costs" card. */}
                {pricing.perHireMinor > 0 ? `+ ${formatMoney(pricing.perHireMinor, currency)} per hire · ` : ""}set by the score band
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-5">
          {action.kind === "send" ? (
            <ButtonLink
              href={`/employer/send-proposal?intern=${encodeURIComponent(profile.id)}${shortlist ? `&project=${encodeURIComponent(shortlist.projectId)}` : ""}`}
              variant="primary"
            >
              <Send className="size-4" aria-hidden />
              Send proposal
            </ButtonLink>
          ) : action.kind === "view" ? (
            <ButtonLink href={`/employer/proposal/${encodeURIComponent(action.proposalId)}`} variant="primary">
              View sent proposal
            </ButtonLink>
          ) : relation?.hired ? null : (
            <p className="rounded-apple-sm bg-ink-100 px-4 py-2.5 text-sm text-ink-700">{action.reason}</p>
          )}
          {relation?.hired && relation.proposal ? (
            <ButtonLink href={`/employer/proposal/${encodeURIComponent(relation.proposal.id)}`} variant="primary">
              View placement
            </ButtonLink>
          ) : null}
          {relation?.fullTimeFrom ? (
            <FullTimeOfferButton
              employerId={employerId}
              proposalId={relation.fullTimeFrom}
              candidate={displayName}
              fteStatus={employerFte}
              timezone={employerZone}
            />
          ) : null}
          {shortlist && action.kind === "send" ? (
            <ShortlistToggle internId={profile.id} projectId={shortlist.projectId} shortlisted={shortlist.on} />
          ) : null}
          {/* EMB-12: hires and full-time offers are not compared (legacy). */}
          {compareBlocked ? null : <CompareToggle employerId={employerId} internId={profile.id} picked={comparePicks} />}
          <a href="#ai-report" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            AI interview report
          </a>
        </div>
      </Surface>

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          {profile.skills.length > 0 ? (
            <section>
              <SectionHead title="Skills and tools" />
              <ul className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <li key={skill} className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200/70">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="ai-report" className="scroll-mt-24">
            <AiFeedbackReport
              candidateName={displayName}
              findternScore={profile.score}
              ratings={profile.ratings}
              aiFeedbackLink={aiLinks.feedbackLink}
              // Recording only after hire; the written report before (legacy).
              aiRecordingLink={nameUnlocked ? aiLinks.recordingLink : null}
            />
          </section>

          {profile.bio ? (
            <section>
              <SectionHead title="About" />
              <Surface className="p-6">
                <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-700">{profile.bio}</p>
              </Surface>
            </section>
          ) : null}

          {academics ? (
            <section>
              <SectionHead title="Academics" />
              <Surface className="px-6 py-2">
                <dl className="divide-y divide-ink-100">
                  <DetailRow label="Institution" value={academics.institution || "Not stated"} />
                  <DetailRow label="Degree" value={[academics.degree, academics.specialization].filter(Boolean).join(", ") || "Not stated"} />
                  <DetailRow label="Level" value={academics.level ? humanise(academics.level) : "Not stated"} />
                  <DetailRow label="Years" value={[academics.startYear, academics.endYear].filter(Boolean).join(" – ") || "Not stated"} mono />
                  <DetailRow
                    label="Score"
                    value={academics.score ? `${academics.score}${academics.scoreType ? ` ${academics.scoreType}` : ""}` : "Not stated"}
                    mono
                  />
                  <DetailRow label="Status" value={academics.status ? humanise(academics.status) : "Not stated"} />
                </dl>
              </Surface>
            </section>
          ) : null}

          {experiences.length > 0 ? (
            <section>
              <SectionHead title="Experience and projects" />
              <Surface as="ul" className="divide-y divide-ink-100">
                {experiences.map((exp) => (
                  <li key={exp.id} className="px-6 py-4">
                    <p className="text-[0.9375rem] font-medium text-ink-900">{[exp.role, exp.company].filter(Boolean).join(" · ")}</p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {exp.description ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{exp.description}</p> : null}
                  </li>
                ))}
              </Surface>
            </section>
          ) : null}

          {qualifications.length > 0 || (academics && academics.courses.length > 0) ? (
            <section>
              <SectionHead title="Courses and certifications" />
              <Surface as="ul" className="divide-y divide-ink-100">
                {qualifications.map((q) => (
                  <li key={q.id} className="px-6 py-4">
                    <p className="text-[0.9375rem] font-medium text-ink-900">{q.name}</p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      {[q.issuer, q.completionDate && formatDate(q.completionDate)].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
                {(academics?.courses ?? []).map((course, i) => (
                  <li key={`${course.name}-${i}`} className="px-6 py-4">
                    <p className="text-[0.9375rem] font-medium text-ink-900">{course.name}</p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      {[course.institution, course.level, course.completed, course.score].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
              </Surface>
            </section>
          ) : null}

          {languages.length > 0 || activities.length > 0 ? (
            <section className="grid gap-8 sm:grid-cols-2">
              {languages.length > 0 ? (
                <div className="min-w-0">
                  <SectionHead title="Languages" />
                  <Surface as="ul" className="divide-y divide-ink-100">
                    {languages.map((l) => (
                      <li key={l.id} className="px-5 py-3 text-sm">
                        <span className="font-medium text-ink-900">{l.language}</span>
                        <span className="block text-ink-600">
                          {[l.level, l.read && "Read", l.write && "Write", l.speak && "Speak"].filter(Boolean).join(", ")}
                        </span>
                      </li>
                    ))}
                  </Surface>
                </div>
              ) : null}
              {activities.length > 0 ? (
                <div className="min-w-0">
                  <SectionHead title="Extracurriculars" />
                  <Surface as="ul" className="divide-y divide-ink-100">
                    {activities.map((a) => (
                      <li key={a.id} className="px-5 py-3 text-sm">
                        <span className="font-medium text-ink-900">{a.activity}</span>
                        <span className="block text-ink-600">{[a.category, a.level].filter(Boolean).join(", ")}</span>
                      </li>
                    ))}
                  </Surface>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <Surface className="px-5 py-2">
            <h2 className="pt-3 text-base font-semibold text-ink-900">Practicalities</h2>
            <dl className="divide-y divide-ink-100">
              <DetailRow label="City" value={profile.city || "Not stated"} />
              <DetailRow label="Work mode" value={profile.workModes.join(", ") || "Not stated"} />
              <DetailRow
                label="Prefers"
                value={
                  profile.preferredLocations.map((l) => l.split(",")[0].trim()).join(", ") ||
                  (profile.workModes.length === 1 && profile.workModes[0] === "Remote" ? "Remote only" : "Not stated")
                }
              />
              <DetailRow
                label="Laptop"
                value={profile.hasLaptop === null ? "Not stated" : profile.hasLaptop ? "Has one" : "Needs one provided"}
              />
            </dl>
            {/* LinkedIn URLs usually contain the real name, so the link stays
                hidden until the hire unmasks the candidate. */}
            {nameUnlocked && profile.linkedinUrl ? (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                <Link2 className="size-4" aria-hidden />
                LinkedIn profile
              </a>
            ) : null}
          </Surface>

          {appliedProjects.length > 0 ? (
            <Surface className="p-5">
              <h2 className="text-base font-semibold text-ink-900">Your proposals to them</h2>
              <ul className="mt-3 space-y-3">
                {appliedProjects.map((entry) => {
                  const pill = employerProposalPill(entry.status);
                  return (
                    <li key={entry.id} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 font-medium text-ink-900">{entry.projectName ?? "Project no longer listed"}</span>
                      <Pill tone={pill.tone} className="shrink-0">
                        {pill.label}
                      </Pill>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}
