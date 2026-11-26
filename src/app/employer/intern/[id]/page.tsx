import { campusCohort } from "@/lib/college/campus-lock";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { candidateRelations, isAdminViewing, type CandidateRelation } from "@/lib/employer-visibility";
import { PLAN_NAME, bandFor } from "@/lib/score";
import { RATING_META, displayNameOf, isCatalogSkill, toCandidateProfile, withoutScoreUnlessPro, type CandidateProfile } from "@/lib/employer-candidates";
import { proAccess } from "@/lib/candidate-pro-access";
import { hideContactText, maskInternName } from "@/lib/contact-scrub";
import { employerRegion, resolvePricing } from "@/lib/employer-pricing";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { skillBaseName, studyOf } from "@/components/employer/candidate-view";
import { candidateStatusPill } from "@/components/employer/candidate-status";
import { attachPhotos, canEmployerSeeIntern } from "@/lib/employer-pool";
import { isBlockingInterview } from "@/lib/employer-interview-rules";
import { notify } from "@/lib/notify";
import { isOpenProject, rememberedSelection } from "@/lib/employer-selection";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { parseOffer } from "@/lib/offer";
import { timezoneForLocation } from "@/lib/timezones";
import { draftFromRecord, linkedinHref, type OnboardingDraft } from "@/lib/onboarding";
import { ProfileView, type AppliedProject, type ProposalAction } from "@/components/employer/intern-detail/profile-view";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { projectCities } from "@/lib/project-locations";
import { workPreferenceRows } from "@/lib/work-preferences";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { getActivePricingPlans } from "@/lib/cached-reads";

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

export default async function EmployerInternDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string; track?: string; offer?: string }>;
}) {
  const { id } = await params;
  const { project: requestedProject, track, offer } = await searchParams;
  const session = await requireRole("employer");
  const employerId = session.uid;

  let profile: CandidateProfile | null = null;
  let appliedProjects: AppliedProject[] = [];
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
  /** "Online" / "Last seen 2h ago" / "Offline"; null when the candidate hides it. */
  let presence: PresenceLabel | null = null;
  /** The selected project's skills: matching chips are ticked and listed first, as on the candidate list. */
  let wanted: { project: string; skills: string[]; cities: string[] } | null = null;

  try {
    const db = getDb();

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isActive, true), eq(schema.users.role, "intern")))
      .limit(1);

    const adminViewing = await isAdminViewing();
    if (user && (adminViewing || (await canEmployerSeeIntern(db, employerId, id, { keepRelationships: true })))) {
      visible = true;
      const remembered = await rememberedSelection(employerId);
      // `?project=` keeps the shortlist on the project the employer was
      // browsing; then the one picked on the candidates page; then the
      // newest open one (EMH-15).
      const projectRows = (
        await db
          .select({ id: schema.projects.id, status: schema.projects.status, takenDownAt: schema.projects.takenDownAt, projectName: schema.projects.projectName, skills: schema.projects.skills, city: schema.projects.city, locationType: schema.projects.locationType, preferredLocations: schema.projects.preferredLocations })
          .from(schema.projects)
          .where(eq(schema.projects.employerId, employerId))
          .orderBy(desc(schema.projects.createdAt))
      ).filter((row) => isOpenProject(row.status, row.takenDownAt));
      const project =
        projectRows.find((row) => row.id === requestedProject) ??
        projectRows.find((row) => row.id === remembered.project) ??
        projectRows[0];
      if (project) {
        wanted = { project: project.projectName ?? "your project", skills: (Array.isArray(project.skills) ? project.skills : []).filter(Boolean), cities: projectCities(project) };
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
        })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, id)))
        .orderBy(desc(schema.proposals.createdAt));
      relation = (await candidateRelations(db, employerId, [id])).get(id) ?? null;

      if (proposals.length > 0) {
        // Redaction lifts only on hire - sent / accepted / in-cart stays initials.
        nameUnlocked = nameUnlocked || Boolean(relation?.hired);

        // Collapse to one row per project, keeping the most recent status.
        const latest = new Map<string, { status: string; fullTime: boolean }>();
        for (const proposal of proposals) {
          if (!latest.has(proposal.projectId))
            latest.set(proposal.projectId, { status: proposal.status, fullTime: Boolean(parseOffer(proposal.offerDetails, proposal.currency).fullTime) });
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

      // CGPA and percentage are Findtern Pro only: blanked here, before the profile goes to any component.
      profile = withoutScoreUnlessPro(toCandidateProfile(user, onboarding), await proAccess(employerId));
      // Before the hire the candidate's own name, typed into free text (institution, degree), is masked too.
      if (!nameUnlocked) profile = { ...profile, academics: maskInternName(profile.academics, user.firstName, user.lastName), skills: maskInternName(profile.skills, user.firstName, user.lastName) };
      // Photo shows before hire (owner, 6 Nov); the name stays initials until hired.
      await attachPhotos(db, [profile]);
      presence = (await presenceOf([profile.id]).catch(() => ({} as Record<string, PresenceLabel | null>)))[profile.id] ?? null;
      // Before the hire, profile text stored ahead of the contact check is hidden where it carries contact (OA1).
      if (onboarding) details = nameUnlocked ? draftFromRecord(onboarding) : maskInternName(hideContactText(draftFromRecord(onboarding), isCatalogSkill), user.firstName, user.lastName);
      plans = await getActivePricingPlans();

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
  const status = candidateStatusPill(relation?.proposal ?? null, relation?.expired ?? null);
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
  const workPreferences = workPreferenceRows(profile, wanted?.cities ?? []);
  const axes = RATING_META.map((m) => ({ label: m.label, value: profile.ratings[m.key] > 0 ? Math.min(10, profile.ratings[m.key]) : null }));
  const rated = axes.filter((a): a is { label: string; value: number } => a.value !== null).sort((a, b) => b.value - a.value);
  const linkedin = nameUnlocked ? linkedinHref(profile.linkedinUrl) : null;
  // Campus drive, Full-time track: a final-year student of the drive this company is in can get a full-time offer at the
  // drive's 1% fee, straight from the profile (the server checks the drive, the year and the project again).
  let driveFullTime: { driveId: string; projects: { id: string; name: string }[] } | null = null;
  const cohort = relation?.hired || relation?.proposal?.fullTime ? null : await campusCohort(employerId);
  const ftDrive = cohort?.finalYear.has(profile.id) ? cohort.driveOf.get(profile.id) : undefined;
  if (ftDrive) {
    const rows = await getDb()
      .select({ id: schema.projects.id, name: schema.projects.projectName, status: schema.projects.status, takenDownAt: schema.projects.takenDownAt })
      .from(schema.projects)
      .where(eq(schema.projects.employerId, employerId))
      .orderBy(desc(schema.projects.createdAt));
    driveFullTime = { driveId: ftDrive, projects: rows.filter((r) => isOpenProject(r.status, r.takenDownAt)).map((r) => ({ id: r.id, name: r.name ?? "Project" })) };
  }
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(profile.id)}${shortlist ? `&project=${encodeURIComponent(shortlist.projectId)}` : ""}`;
  return (
    <ProfileView
      employerId={employerId}
      employerFte={employerFte}
      employerZone={employerZone}
      profile={profile}
      nameUnlocked={nameUnlocked}
      displayName={displayName}
      adminContact={adminContact}
      presence={presence}
      status={status}
      statusProjectName={statusProjectName}
      headline={headline}
      linkedin={linkedin}
      band={band}
      plan={plan}
      pricing={pricing}
      currency={currency}
      action={action}
      sendHref={sendHref}
      relation={relation}
      appliedProjects={appliedProjects}
      comparePicks={comparePicks}
      compareBlocked={compareBlocked}
      shortlist={shortlist}
      driveFullTime={driveFullTime}
      // Opened from a drive's Full-time tab: the full-time offer is the main action (and opens at once from the card's button).
      fullTimeFirst={driveFullTime && (track === "full_time" || offer === "full_time") ? (offer === "full_time" ? "open" : "show") : null}
      wanted={wanted}
      matchCount={matchCount}
      workPreferences={workPreferences}
      axes={axes}
      rated={rated}
      aiLinks={aiLinks}
      experiences={experiences}
      qualifications={qualifications}
      languages={languages}
      activities={activities}
    />
  );
}
