import type { Metadata } from "next";
import { proposalPill } from "@/components/employer/proposal-state";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileText, Link2, MapPin, Send, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { candidateRelations, isAdminViewing, type CandidateRelation } from "@/lib/employer-visibility";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { PLAN_NAME, bandFor } from "@/lib/score";
import { formatDate, formatMoney } from "@/lib/format";
import { RATING_META, displayNameOf, isCatalogSkill, preferredCities, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { hideContactText } from "@/lib/contact-scrub";
import { employerRegion, resolvePricing } from "@/lib/employer-pricing";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { FitTicks, SkillChips } from "@/components/employer/candidate-row-parts";
import { ProposalTrail } from "@/components/employer/intern-detail/proposal-trail";
import { Section } from "@/components/app/stat";
import { skillBaseName, studyOf } from "@/components/employer/candidate-view";
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
import { dateLabel, draftFromRecord, linkedinHref, type OnboardingDraft } from "@/lib/onboarding";
import { PageHead, Pill } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { profileText } from "@/components/employer/profile-text";
import { PresenceDot } from "@/components/app/presence-dot";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";

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
 * The photo shows before a hire. The name, contact details and LinkedIn stay
 * redacted until this employer's hire is paid - see `displayNameOf` in `lib/employer-candidates`.
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
  let appliedProjects: { id: string; projectName: string | null; status: string; fullTime: boolean; sentAt: Date | null; movedAt: Date | null }[] = [];
  /** The project the shown offer belongs to: the status pill names it, so it never reads as the person's state. */
  let statusProjectName: string | null = null;
  let currency: "INR" | "USD" = "INR";
  let region: "IN" | null = null;
  /** Full name, contact details and LinkedIn show only once this employer's hire is paid; the photo always shows. */
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
  /** "Active now" / "Last seen 2h ago" / "Offline"; null when the candidate hides it. */
  let presence: PresenceLabel | null = null;
  /** The selected project's skills: matching chips are ticked and listed first, as on the candidate list. */
  let wanted: { project: string; skills: string[] } | null = null;

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
      // `?project=` keeps the shortlist on the project the employer was
      // browsing; then the one picked on the candidates page; then the
      // newest open one (EMH-15).
      const projectRows = (
        await db
          .select({ id: schema.projects.id, status: schema.projects.status, takenDownAt: schema.projects.takenDownAt, projectName: schema.projects.projectName, skills: schema.projects.skills })
          .from(schema.projects)
          .where(eq(schema.projects.employerId, employerId))
          .orderBy(desc(schema.projects.createdAt))
      ).filter((row) => isOpenProject(row.status, row.takenDownAt));
      const project =
        projectRows.find((row) => row.id === requestedProject) ??
        projectRows.find((row) => row.id === remembered.project) ??
        projectRows[0];
      if (project) {
        wanted = { project: project.projectName ?? "your project", skills: (Array.isArray(project.skills) ? project.skills : []).filter(Boolean) };
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
        // Compare picks are kept per project: this project's, the one the shortlist and Compare act on.
        comparePicks = remembered.compareByProject[project.id] ?? [];
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
            message: `An employer viewed your profile${name ? `, ${name}` : ""}: ${views} view${views === 1 ? "" : "s"} so far.`,
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
          createdAt: schema.proposals.createdAt,
          updatedAt: schema.proposals.updatedAt,
          hiredAt: schema.proposals.hiredAt,
        })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, id)))
        .orderBy(desc(schema.proposals.createdAt));
      relation = (await candidateRelations(db, employerId, [id])).get(id) ?? null;

      if (proposals.length > 0) {
        // Redaction lifts only on hire - sent / accepted / in-cart stays initials.
        nameUnlocked = nameUnlocked || Boolean(relation?.hired);

        // Collapse to one row per project, keeping the most recent status.
        const latest = new Map<string, { status: string; fullTime: boolean; sentAt: Date | null; movedAt: Date | null }>();
        for (const proposal of proposals) {
          if (!latest.has(proposal.projectId))
            latest.set(proposal.projectId, {
              status: proposal.status,
              fullTime: Boolean(parseOffer(proposal.offerDetails, proposal.currency).fullTime),
              sentAt: proposal.createdAt,
              movedAt: proposal.status === "hired" ? (proposal.hiredAt ?? proposal.updatedAt) : proposal.updatedAt,
            });
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
          status: latest.get(projectId)?.status ?? "sent",
          fullTime: latest.get(projectId)?.fullTime ?? false,
          sentAt: latest.get(projectId)?.sentAt ?? null,
          movedAt: latest.get(projectId)?.movedAt ?? null,
        }));
        const shownProjectId = proposals.find((p) => p.id === relation?.proposal?.id)?.projectId;
        statusProjectName = (shownProjectId && projectNameById.get(shownProjectId)) || null;
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
      // Photo shows before hire (owner, 6 Nov); the name stays initials until hired.
      await attachPhotos(db, [profile]);
      presence = (await presenceOf([profile.id]).catch(() => ({} as Record<string, PresenceLabel | null>)))[profile.id] ?? null;
      // Before the hire, profile text stored ahead of the contact check is hidden where it carries contact (OA1).
      if (onboarding) details = nameUnlocked ? draftFromRecord(onboarding) : hideContactText(draftFromRecord(onboarding), isCatalogSkill);
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
        <LoadError what="this profile" retryHref={`/employer/intern/${encodeURIComponent(id)}`} email={SITE.adminEmail} />
      </div>
    );
  }

  const aiLinks = await aiInterviewLinks(profile.id, {
    aiFeedbackLink: profile.aiFeedbackLink,
    aiRecordingLink: profile.aiRecordingLink,
  });
  const band = bandFor(profile.score);
  const pricing = resolvePricing(profile.score, plans, currency, region, await getPerHireFeeSetting());
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

  const plan = PLAN_NAME[band.id];
  const wantedSet = new Set((wanted?.skills ?? []).map((s) => skillBaseName(s).toLowerCase()));
  const skills = profile.skills;
  const matchCount = skills.filter((s) => wantedSet.has(skillBaseName(s).toLowerCase())).length;
  const headline = studyOf(academics);
  // "Also works in" lists the other cities only: the home city is already in the line before it.
  const homeCity = (profile.location ?? "").split(",")[0].trim().toLowerCase();
  const prefers = preferredCities(profile.preferredLocations).filter((c) => c.trim().toLowerCase() !== homeCity);
  const axes = RATING_META.map((m) => ({ label: m.label, value: profile.ratings[m.key] > 0 ? Math.min(10, profile.ratings[m.key]) : null }));
  const rated = axes.filter((a): a is { label: string; value: number } => a.value !== null).sort((a, b) => b.value - a.value);
  const linkedin = nameUnlocked ? linkedinHref(profile.linkedinUrl) : null;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(profile.id)}${shortlist ? `&project=${encodeURIComponent(shortlist.projectId)}` : ""}`;
  /** Free text with contact details hidden until hire. */
  const t = (value: string | null | undefined) => (value ? profileText(value, nameUnlocked) : "");
  const range = band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`;
  const stat = "flex items-baseline justify-between gap-4 py-2.5 text-sm";

  return (
    <div className="pb-12">
      <Link
        href={`/employer/candidates${shortlist ? `?project=${encodeURIComponent(shortlist.projectId)}` : ""}`}
        className="-ml-1 mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      {adminContact ? (
        <p className="mb-6 rounded-lg border border-accent-300 bg-accent-100/60 px-4 py-2.5 text-sm text-ink-800">
          <span className="font-semibold">Admin view:</span>{" "}
          <a href={`mailto:${adminContact.email}`} className="underline underline-offset-4">
            {adminContact.email}
          </a>
          {adminContact.phone ? <> · {adminContact.phone}</> : null}
        </p>
      ) : null}

      {/* Left: who they are, then the evidence. Right (lg): the sticky hire column. A phone reads header, hire column, evidence. */}
      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <header className="min-w-0 pb-8 lg:col-start-1">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <span className="relative shrink-0">
              <CandidateAvatar photoUrl={profile.photoUrl} initials={profile.initials} className="size-14 rounded-full bg-ink-100 text-lg text-ink-800 sm:size-16 sm:text-xl" />
              {presence ? (
                <span
                  aria-hidden
                  className={`absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-paper ${presence === PRESENCE_ONLINE ? "bg-success" : "bg-ink-300"}`}
                />
              ) : null}
            </span>
            <div className="min-w-0">
              <h1 className="break-words font-display text-2xl font-semibold leading-[1.1] sm:text-4xl sm:leading-[1.05] tracking-[-0.02em] text-ink-900">
                {displayName}
                {nameUnlocked ? null : <span className="sr-only">. Names and contact details unlock once your hire is paid.</span>}
              </h1>
              {headline ? <p className="mt-2 break-words text-lg leading-snug text-ink-800">{headline}</p> : null}
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-ink-700">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0 text-ink-600" aria-hidden />
                  {profile.location || "Location not stated"}
                </span>
                {prefers.length > 0 ? <span>Also works in {prefers.join(", ")}</span> : null}
                {presence ? <PresenceDot label={presence} withText /> : null}
                {linkedin ? (
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-700 underline-offset-4 hover:underline"
                  >
                    <Link2 className="size-4" aria-hidden />
                    LinkedIn
                  </a>
                ) : null}
              </p>
              {status && statusProjectName ? (
                <Pill tone={status.tone} className="mt-2 max-w-full">
                  <span className="truncate">{statusProjectName}: {status.label}</span>
                </Pill>
              ) : null}
            </div>
          </div>
        </header>

        <aside aria-label="Hire" className="min-w-0 pb-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pb-0">
          <div className="space-y-6 lg:sticky lg:top-20">
            <div className="border-t-2 border-ink-900 pt-4">
              <p className="text-sm text-ink-700">What you pay</p>
              <p className="nums mt-1 font-display text-4xl font-semibold leading-none text-ink-900">
                {formatMoney(pricing.hourlyRateMinor, currency)}
                <span className="ml-1 font-sans text-base font-normal text-ink-700">/ hr</span>
              </p>
              <p className="mt-2 text-sm text-ink-700">Set by the {profile.scored ? `${plan} ` : ""}band</p>
              {pricing.perHireMinor > 0 ? (
                <p className="nums text-sm text-ink-700">
                  plus <span className="font-medium text-ink-900">{formatMoney(pricing.perHireMinor, currency)}</span> one-time hiring charge
                </p>
              ) : (
                <p className="nums text-sm text-ink-700">
                  plus <s className="text-ink-600">{formatMoney(pricing.perHireListMinor, currency)}</s>{" "}
                  <span className="font-semibold text-success">(FREE)</span> one-time hiring charge
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 [&_button]:w-full [&_button]:justify-center">
              {action.kind === "send" ? (
                <ButtonLink href={sendHref} variant="primary" block className="min-h-11">
                  <Send className="size-4" aria-hidden />
                  Send proposal
                </ButtonLink>
              ) : action.kind === "view" ? (
                <ButtonLink href={`/employer/proposal/${encodeURIComponent(action.proposalId)}`} variant="primary" block className="min-h-11">
                  View sent proposal
                </ButtonLink>
              ) : relation?.hired ? null : (
                <p className="rounded-md bg-ink-100 px-4 py-2.5 text-sm text-ink-800">{action.reason}</p>
              )}
              {relation?.hired && relation.proposal ? (
                <ButtonLink href={`/employer/proposal/${encodeURIComponent(relation.proposal.id)}`} variant="primary" block className="min-h-11">
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
              {compareBlocked ? null : <CompareToggle employerId={employerId} internId={profile.id} projectId={shortlist?.projectId ?? null} picked={comparePicks} />}
            </div>

            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              <div className={stat}>
                <dt className="text-ink-700">Works</dt>
                <dd className="text-right font-medium text-ink-900">{profile.workModes.join(" / ") || "Not stated"}</dd>
              </div>
              <div className={stat}>
                <dt className="text-ink-700">Laptop</dt>
                <dd className="text-right font-medium text-ink-900">{profile.hasLaptop === null ? "Not stated" : profile.hasLaptop ? "Own" : "Needs one"}</dd>
              </div>
            </dl>

            {appliedProjects.length > 0 ? (
              <div>
                <h2 className="mb-2 font-display text-lg font-semibold text-ink-900">Your proposals to them</h2>
                <ProposalTrail
                  rows={appliedProjects.slice(0, PROPOSALS_SHOWN).map((entry) => ({
                    id: entry.id,
                    projectName: entry.projectName,
                    status: entry.status,
                    pill: proposalPill(entry.status, entry.fullTime),
                    sentAt: entry.sentAt,
                    movedAt: entry.movedAt,
                  }))}
                />
                {appliedProjects.length > PROPOSALS_SHOWN ? (
                  <Link href="/employer/proposals" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
                    See all {appliedProjects.length} in Proposals
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1">
          <div id="ai-report" className="scroll-mt-24">
            <Section title="Findtern Score" hint="From the AI interview, coding and aptitude rounds, and communication.">
              <div className="grid gap-x-12 gap-y-6 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div className="max-w-56">
                  {profile.scored ? (
                    <>
                      <p className="nums font-display text-4xl font-semibold leading-none text-brand-800">
                        {profile.score.toFixed(1)}
                        <span className="ml-1 text-lg font-medium text-ink-600">/10</span>
                      </p>
                      <p className="mt-3 text-sm text-ink-700">
                        <span className="font-semibold text-ink-900">{plan}</span>, score {range}. {band.blurb}
                      </p>
                    </>
                  ) : (
                    <p className="text-base text-ink-700">Not scored yet</p>
                  )}
                </div>
                <div className="min-w-0">
                  {/* The bars are the evidence; the sentence only names the spread. All parts tied: the bars say it. */}
                  {rated.length === 0 ? (
                    <p className="text-sm text-ink-700">No AI interview score yet. The breakdown appears once the interview is reviewed.</p>
                  ) : rated.length > 1 && rated[0].value !== rated[rated.length - 1].value ? (
                    <p className="text-sm text-ink-700">
                      Strongest in {rated[0].label} (<span className="nums">{rated[0].value.toFixed(1)}</span>), lowest in {rated[rated.length - 1].label} (
                      <span className="nums">{rated[rated.length - 1].value.toFixed(1)}</span>).
                    </p>
                  ) : null}
                  <dl className="mt-2 divide-y divide-ink-200 border-y border-ink-200">
                    {axes.map(({ label, value }) => (
                      <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.25rem] items-center gap-x-4 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)_3.5rem]">
                        <dt className="text-sm text-ink-800">{label}</dt>
                        {value !== null ? (
                          <>
                            <dd aria-hidden className="h-1.5 overflow-hidden rounded-sm bg-ink-200">
                              <div className="h-full rounded-sm bg-brand-700" style={{ width: `${value * 10}%` }} />
                            </dd>
                            <dd className="nums text-right font-display text-lg font-semibold leading-none text-ink-900">{value.toFixed(1)}</dd>
                          </>
                        ) : (
                          <dd className="col-span-2 text-sm text-ink-600">Not rated yet</dd>
                        )}
                      </div>
                    ))}
                  </dl>
                  {rated.length > 0 && (aiLinks.feedbackLink || (nameUnlocked && aiLinks.recordingLink)) ? (
                    <div className="-ml-3 mt-2 flex flex-wrap items-center gap-1 print:hidden">
                      {aiLinks.feedbackLink ? (
                        <a href={aiLinks.feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                          <FileText className="size-4" aria-hidden />
                          Feedback report
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                      {/* Recording only after hire; the written report before (legacy). */}
                      {nameUnlocked && aiLinks.recordingLink ? (
                        <a href={aiLinks.recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                          <Video className="size-4" aria-hidden />
                          Recording
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </Section>
          </div>

          {skills.length > 0 ? (
            <Section
              title="Skills"
              hint={wanted && wanted.skills.length > 0 ? `${matchCount} of ${wanted.skills.length} match ${wanted.project}` : undefined}
            >
              {wanted && wanted.skills.length > 0 ? <FitTicks className="mb-3" matched={matchCount} total={wanted.skills.length} /> : null}
              {/* The same chips as the candidate list: project matches first and ticked, at most seven, then +N. */}
              <SkillChips skills={skills} wanted={wanted?.skills ?? []} />
            </Section>
          ) : null}

          {academics ? (
            <Section title="Education">
              <p className="break-words text-base font-medium text-ink-900">{academics.institution || "Institution not stated"}</p>
              <p className="mt-0.5 break-words text-sm text-ink-700">
                {[headline, academics.level ? humanise(academics.level) : ""].filter(Boolean).join(" · ") || "Degree not stated"}
              </p>
              <p className="nums mt-0.5 text-sm text-ink-700">
                {[
                  [academics.startYear, academics.endYear].filter(Boolean).join(" – "),
                  academics.score ? `${academics.score}${academics.scoreType ? ` ${academics.scoreType.toUpperCase()}` : ""}` : "",
                  academics.status ? humanise(academics.status) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Section>
          ) : null}

          {experiences.length > 0 ? (
            <Section title="Experience and projects">
              <ul className="divide-y divide-ink-200">
                {experiences.map((exp) => (
                  <li key={exp.id} className="py-4 first:pt-1">
                    <p className="break-words text-base font-medium text-ink-900">{[t(exp.role), t(exp.company)].filter(Boolean).join(" · ")}</p>
                    {exp.type || exp.from || exp.to || exp.current ? (
                      <p className="nums mt-0.5 text-sm text-ink-700">
                        {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {exp.description ? <p className="mt-2 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-ink-800">{t(exp.description)}</p> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {qualifications.length > 0 || (academics && academics.courses.length > 0) ? (
            <Section title="Certificates and courses">
              <ul className="divide-y divide-ink-200">
                {qualifications.map((q) => (
                  <li key={q.id} className="py-3 first:pt-1">
                    <p className="break-words text-base font-medium text-ink-900">{t(q.name)}</p>
                    <p className="nums mt-0.5 text-sm text-ink-700">
                      {[t(q.issuer), q.completionDate && formatDate(q.completionDate)].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
                {(academics?.courses ?? []).map((course, i) => (
                  <li key={`${course.name}-${i}`} className="py-3 first:pt-1">
                    <p className="break-words text-base font-medium text-ink-900">{t(course.name)}</p>
                    <p className="nums mt-0.5 text-sm text-ink-700">
                      {[t(course.institution), course.level, course.completed, course.score].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {languages.length > 0 || activities.length > 0 ? (
            <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {languages.length > 0 ? (
                <Section title="Languages">
                  <ul className="divide-y divide-ink-200">
                    {languages.map((l) => (
                      <li key={l.id} className="py-2.5 text-sm first:pt-1">
                        <span className="font-medium text-ink-900">{l.language}</span>
                        <span className="block text-ink-700">{[l.level, l.read && "Read", l.write && "Write", l.speak && "Speak"].filter(Boolean).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              {activities.length > 0 ? (
                <Section title="Activities">
                  <ul className="divide-y divide-ink-200">
                    {activities.map((a) => (
                      <li key={a.id} className="py-2.5 text-sm first:pt-1">
                        <span className="font-medium text-ink-900">{t(a.activity)}</span>
                        <span className="block text-ink-700">{[a.category, a.level].filter(Boolean).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "Your proposals to them" shows the latest few; the rest live on the Proposals page. */
const PROPOSALS_SHOWN = 3;
function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}
