import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { FolderPlus, Hourglass, Search } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { FIRST_PAYMENT_EXPLAINER } from "@/lib/first-payment-copy";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { RowAvatar } from "@/components/employer/candidate-row-parts";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { rowSkills, skillBaseName } from "@/components/employer/candidate-view";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { isMeetingLinkLive, meetingEndsAt } from "@/lib/employer-interview-rules";
import { payableCheckout } from "@/lib/employer-payable";
import { isProjectOpen } from "@/lib/project-locations";
import { offerState } from "@/components/employer/proposal-state";
import { proposalBucket } from "@/components/employer/proposal-bucket";
import { parseOffer } from "@/lib/offer";
import { timezoneForLocation } from "@/lib/timezones";
import { formatSlotTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildActivity, buildFunnel, buildProjectStats, untilLabel, type Activity as ActivityData, type DashProposal, type Funnel as FunnelData } from "@/lib/employer-dashboard";
import { Hero } from "@/components/employer/dashboard/hero";
import { Funnel } from "@/components/employer/dashboard/funnel";
import { Activity } from "@/components/employer/dashboard/activity";
import { MatchCard, type MatchCardProps } from "@/components/employer/dashboard/match-card";
import { ProjectProgress } from "@/components/employer/dashboard/project-progress";
import { MatchHeader, MatchRow, MeetingGlyph, PipelineStrip, ProjectLine, Queue, ScoreBands, SectionHead, type PipelineStep, type QueueItem } from "./_parts";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

type ProjectRow = typeof schema.projects.$inferSelect;
type InterviewRow = typeof schema.interviews.$inferSelect;

type Task = QueueItem & {
  /** False when the next move is someone else's (the candidate picking a time). */
  yours?: boolean;
};

type Loaded = {
  companyName: string;
  timezone: string;
  projects: ProjectRow[];
  proposals: {
    status: string;
    projectId: string;
    internId: string;
    offerDetails: unknown;
    createdAt: Date | null;
    hiredAt: Date | null;
  }[];
  /** Interns with a scheduled or completed interview (funnel: "met"). */
  metInternIds: string[];
  submittedSheets: number;
  pendingInterviews: number;
  nextInterview: InterviewRow | null;
  /** People on the shortlist with no live proposal, and the candidate-project rows they fill. */
  shortlisted: number;
  shortlistEntries: number;
  toPay: number;
  candidates: CandidateProfile[];
  presence: Record<string, PresenceLabel | null>;
  /** Lower-cased project skill names the matches are ranked on. */
  wanted: string[];
  /** Per candidate: the open project they fit best and how many of its skills they have. */
  fit: Record<string, Fit | null>;
  /** "projectId:internId" pairs already on the shortlist. */
  saved: string[];
  /** Intern ids on the shortlist or checkout list (funnel: "in pipeline"). */
  shortlistInternIds: string[];
  /** Who the next meeting is with (initials and photo only) and for which project. */
  nextWith: {
    initials: string;
    photoUrl: string | null;
    projectName: string | null;
  } | null;
};

type Fit = {
  projectId: string;
  projectName: string;
  hit: number;
  of: number;
  skills: string[];
};

/**
 * Employer home.
 *
 * Built around one question: what is waiting on me? The hero is that queue,
 * with its total in the heading (pay for accepted offers, approve hours, send
 * proposals to the shortlist), one filled button on the first row. Under it
 * the proposal pipeline as one strip, then the candidates who match the open
 * projects, initials only (bug sheet 7 NC r41), best score first. The right
 * column is the next meeting and the projects.
 */
export default async function EmployerDashboard() {
  const session = await requireRole("employer");
  const employerId = session.uid;
  // No company profile or no project yet: finish onboarding first.
  await requireEmployerSetup(employerId);

  const data = await load(employerId).catch((err) => {
    console.error("Failed to load employer dashboard:", err);
    return null;
  });

  if (!data) {
    return (
      <div>
        <PageHead title="Dashboard" />
        <LoadError what="your dashboard" retryHref="/employer/dashboard" email={SITE.adminEmail} />
      </div>
    );
  }

  const { proposals, projects } = data;
  // The same buckets as the Proposals tabs (an unanswered offer past its start
  // date is closed there), so every figure here matches the tab it opens.
  const bucket = proposals.map((p) => proposalBucket(p.status, offerState({ status: p.status, hiredAt: null }, parseOffer(p.offerDetails)).lapsed));
  const dashProposals: DashProposal[] = proposals.map((p, i) => ({
    internId: p.internId,
    projectId: p.projectId,
    status: p.status,
    bucket: bucket[i],
    createdAt: p.createdAt,
    hiredAt: p.hiredAt,
  }));
  const awaiting = bucket.filter((b) => b === "open").length;
  const accepted = bucket.filter((b) => b === "accepted").length;
  const hired = bucket.filter((b) => b === "hired").length;
  const declined = bucket.filter((b) => b === "closed").length;

  const tasks: Task[] = (
    [
      {
        count: data.toPay,
        label: data.toPay === 1 ? "payment due" : "payments due",
        // First sentence up front, the charge breakdown behind "How it works": nothing dropped, nothing cut mid-sentence.
        detail: FIRST_PAYMENT_EXPLAINER.slice(0, FIRST_PAYMENT_EXPLAINER.indexOf(":")) + ".",
        more: FIRST_PAYMENT_EXPLAINER.slice(FIRST_PAYMENT_EXPLAINER.indexOf(":") + 2).replace(/^./, (c) => c.toUpperCase()),
        href: "/employer/checkout",
        cta: "Pay now",
      },
      {
        count: data.submittedSheets,
        label: data.submittedSheets === 1 ? "timesheet to review" : "timesheets to review",
        detail: "Interns are paid on approved hours only.",
        href: "/employer/timesheets",
        cta: "Review hours",
      },
      {
        count: data.pendingInterviews,
        label: data.pendingInterviews === 1 ? "meeting waiting on the candidate" : "meetings waiting on candidates",
        detail: "They pick one of the three times you offered. Send a reminder from your schedule if it's been a while.",
        href: "/employer/schedule",
        cta: "Open schedule",
        yours: false,
      },
      {
        count: data.shortlisted,
        label: data.shortlisted === 1 ? "shortlisted candidate, no proposal yet" : "shortlisted candidates, no proposal yet",
        // The nav badge counts shortlist rows (one per candidate and project); say both.
        detail:
          data.shortlistEntries > data.shortlisted
            ? `${data.shortlistEntries} shortlist entries across your projects. Book a meeting or send a proposal to move them forward.`
            : "Book a meeting or send a proposal to move them forward.",
        href: "/employer/cart",
        cta: "Review shortlist",
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const openProjects = projects.filter((p) => isProjectOpen(p.status, p.takenDownAt));
  const shownProjects = [...openProjects, ...projects.filter((p) => !isProjectOpen(p.status, p.takenDownAt))].slice(0, 5);
  // Per project: hires, offers still in play (awaiting a reply or accepted), declined, and payments due.
  const byProject = buildProjectStats(dashProposals);
  const funnel: FunnelData = buildFunnel({
    proposals: dashProposals,
    shortlistInternIds: data.shortlistInternIds,
    metInternIds: data.metInternIds,
  });
  const activity: ActivityData = buildActivity(dashProposals);
  // Your moves first; the meetings a candidate still has to pick sit with the
  // other things waiting on candidates, never in the to-do list.
  const mine = tasks.filter((t) => t.yours !== false);
  const theirs = tasks.filter((t) => t.yours === false);
  const total = mine.reduce((sum, t) => sum + t.count, 0);

  const next = data.nextInterview;
  const nextAt = next ? slotDate(next) : null;
  const joinLive = Boolean(next?.meetingLink && next && isMeetingLinkLive(next));

  // The pipeline, each figure opening the matching Proposals tab.
  const pipeline: PipelineStep[] = [
    {
      n: awaiting,
      label: "Awaiting a reply",
      status: "open",
      tone: "awaiting",
    },
    {
      n: accepted,
      label: "Accepted · to pay",
      status: "accepted",
      tone: "accepted",
    },
    { n: hired, label: "Hired", status: "hired", tone: "hired" },
    {
      n: declined,
      label: "Declined or expired",
      status: "closed",
      tone: "closed",
    },
  ];

  // One shape for the old rows and the new cards (WP3 swaps the rows for cards).
  const matches: MatchCardProps[] = data.candidates.map((c) => {
    const fit = data.fit[c.id] ?? null;
    // Tint against the project the row names, so chips and "n of m" agree.
    const { shown, more, isWanted } = rowSkills(c.skills, new Set(fit?.skills ?? data.wanted), 3);
    return {
      id: c.id,
      href: `/employer/intern/${encodeURIComponent(c.id)}${fit ? `?project=${encodeURIComponent(fit.projectId)}` : ""}`,
      initials: c.initials,
      photoUrl: c.photoUrl ?? null,
      presence: data.presence[c.id] ?? null,
      where: [c.city, c.workModes.includes("remote") ? "Remote" : ""].filter(Boolean).join(" · "),
      score: c.scored ? c.score : null,
      fit: fit ? { hit: fit.hit, of: fit.of, projectId: fit.projectId, projectName: fit.projectName } : null,
      chips: shown.map((k) => ({ name: k, matched: isWanted(k) })),
      more,
      saved: fit ? data.saved.includes(`${fit.projectId}:${c.id}`) : false,
    };
  });

  // WP1..WP3 fill these in; until then they render nothing and the page is unchanged. WP4 places them.
  const hiredInterns = funnel.stages[3].count;
  const nextMeeting = {
    meeting:
      next && nextAt
        ? {
            with: data.nextWith ? { initials: data.nextWith.initials, photoUrl: data.nextWith.photoUrl } : null,
            whenLabel: formatSlotTime(nextAt, data.timezone),
            untilLabel: untilLabel(nextAt),
            projectName: data.nextWith?.projectName ?? null,
            joinLink: joinLive && next.meetingLink ? next.meetingLink : null,
            scheduleHref: "/employer/schedule",
          }
        : null,
    hired: hiredInterns,
    offersOut: awaiting,
  };
  const waitingOnCandidates = theirs[0] ? { count: theirs[0].count, label: theirs[0].label, href: theirs[0].href } : null;
  const dateLabel = dashDate(data.timezone);

  return (
    <div>
      <Hero
        companyName={data.companyName}
        dateLabel={dateLabel}
        total={total}
        queue={mine}
        waitingOnCandidates={waitingOnCandidates}
        hasProposals={proposals.length > 0}
        nextMeeting={nextMeeting}
      />
      <Funnel funnel={funnel} />
      <Activity activity={activity} />
      {matches.map((m) => (
        <MatchCard key={m.id} {...m} />
      ))}
      {shownProjects.map((p, i) => {
        const stats = byProject.get(p.id) ?? { hired: 0, open: 0, declined: 0, toPay: 0 };
        const open = isProjectOpen(p.status, p.takenDownAt);
        const action = stats.toPay
          ? { label: "Pay now", href: "/employer/checkout" }
          : !open
            ? null
            : stats.open
              ? { label: "View proposals", href: "/employer/proposals" }
              : { label: "Find candidates", href: `/employer/candidates?project=${encodeURIComponent(p.id)}` };
        return <ProjectProgress key={p.id} id={p.id} name={p.projectName} closed={!open} hired={stats.hired} open={stats.open} declined={stats.declined} action={action} hiddenOnPhone={i >= 3} />;
      })}
      <PageHead
        title="Dashboard"
        action={
          <>
            <ButtonLink href="/employer/projects/new" variant="outline" size="sm" className="max-sm:flex-1">
              <FolderPlus className="size-4" aria-hidden />
              New project
            </ButtonLink>
            {/* With nothing waiting, "Find candidates" is the primary button of the empty state below: one of it per screen. */}
            {mine.length ? (
              <ButtonLink href="/employer/candidates" variant="outline" size="sm" className="max-sm:flex-1">
                <Search className="size-4" aria-hidden />
                Find candidates
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {/* Phone order: queue, next meeting, pipeline, matches, projects. From xl
          the left column is the work and the matches, the right one the meeting and projects. */}
      <div className="flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-x-10">
        <div className="contents xl:block xl:min-w-0 xl:space-y-10">
          <section aria-labelledby="todo-h" className="order-1">
            {mine.length ? (
              <Queue items={mine} total={total} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-200 bg-white p-5 sm:px-6">
                <div className="min-w-0">
                  <h2 id="todo-h" className="scroll-mt-24 text-2xl font-medium text-ink-900">
                    {proposals.length ? "Nothing needs you right now" : "Make your first hire"}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-ink-600">
                    {proposals.length
                      ? "No payments, hours or shortlisted candidates are waiting on you."
                      : "Shortlist candidates ranked by their Findtern Score, meet them, and send a proposal."}
                  </p>
                </div>
                <ButtonLink href="/employer/candidates" variant="primary" size="sm" className="min-h-11 shadow-none hover:shadow-none">
                  Find candidates
                </ButtonLink>
              </div>
            )}
          </section>

          {proposals.length || theirs.length ? (
            <section aria-labelledby="pipeline-h" className="order-3">
              <SectionHead id="pipeline-h" title="Proposals" href="/employer/proposals" link="All proposals" />
              {proposals.length ? <PipelineStrip steps={pipeline} /> : null}
              {/* "Awaiting a reply" is the offers; this adds the meetings, the other thing on candidates. */}
              {theirs.map((t) => (
                <p key={t.href} className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                  <Hourglass className="size-4 shrink-0 text-ink-500" aria-hidden />
                  <span>
                    Also waiting on candidates:{" "}
                    <Link href={t.href} className="font-medium text-ink-800 underline underline-offset-4 hover:text-ink-900 touch:inline-flex touch:min-h-11 touch:items-center">
                      <span className="nums">{`${t.count} ${t.count === 1 ? "meeting time" : "meeting times"} to pick`}</span>
                    </Link>
                  </span>
                </p>
              ))}
            </section>
          ) : null}
        </div>

        <div className="contents xl:block xl:min-w-0 xl:space-y-10">
          {next && nextAt ? (
            <section aria-labelledby="next-h" className="order-2">
              {/* Inside the card, so its top edge sits level with the queue card beside it. */}
              <div className="rounded-2xl border border-ink-200 bg-white p-5">
                <h2 id="next-h" className="scroll-mt-24 text-lg font-medium text-ink-900">
                  Next meeting
                </h2>
                <div className="mt-3 flex items-center gap-3">
                  {data.nextWith ? <RowAvatar photoUrl={data.nextWith.photoUrl} initials={data.nextWith.initials} className="size-10 text-sm sm:size-10" /> : null}
                  <div className="min-w-0">
                    <p className="text-base font-medium text-ink-900">
                      {data.nextWith ? `${data.nextWith.initials} · ` : ""}
                      <span className="nums">{formatSlotTime(nextAt, data.timezone)}</span>
                    </p>
                    <p className="line-clamp-2 break-words text-sm text-ink-600">{data.nextWith?.projectName ?? "No project linked"}</p>
                  </div>
                </div>
                <div className={cn("mt-4 grid gap-2", joinLive && "sm:grid-cols-2")}>
                  {joinLive && next.meetingLink ? (
                    // Filled only when nothing else on the page is: one primary per view.
                    <JoinMeetingButton link={next.meetingLink} size="sm" variant={mine.length ? "outline" : "primary"} block />
                  ) : null}
                  <ButtonLink href="/employer/schedule" variant="outline" size="sm" block>
                    <MeetingGlyph />
                    Open schedule
                  </ButtonLink>
                </div>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="projects-h" className="order-5">
            <SectionHead id="projects-h" title="Projects" href="/employer/projects" link="All projects" />
            {projects.length === 0 ? (
              <EmptyScene
                title="No projects yet"
                body="A project tells us the skills you need, so candidates are matched to it. It takes about five minutes."
                next={{
                  label: "Create a project",
                  href: "/employer/projects/new",
                }}
                who="You - about five minutes"
              />
            ) : (
              <>
                <p className="mb-1 text-sm text-ink-600">
                  {openProjects.length > shownProjects.length
                    ? `Newest ${shownProjects.length} of ${openProjects.length} open`
                    : `${openProjects.length} open of ${projects.length}`}
                </p>
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {shownProjects.map((p, i) => {
                    const stats = byProject.get(p.id) ?? {
                      hired: 0,
                      open: 0,
                      declined: 0,
                      toPay: 0,
                    };
                    const open = isProjectOpen(p.status, p.takenDownAt);
                    const candidatesHref = `/employer/candidates?project=${encodeURIComponent(p.id)}`;
                    const action = stats.toPay
                      ? { label: "Pay now", href: "/employer/checkout" }
                      : !open
                        ? null
                        : stats.open
                          ? {
                              label: "View proposals",
                              href: "/employer/proposals",
                            }
                          : { label: "Find candidates", href: candidatesHref };
                    // Three on a phone, so the list stays a short scroll.
                    return <ProjectLine key={p.id} id={p.id} name={p.projectName} closed={!open} hired={stats.hired} open={stats.open} action={action} hiddenOnPhone={i >= 3} />;
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
        <section aria-labelledby="matches-h" className="order-4 min-w-0 xl:col-span-2">
          <SectionHead id="matches-h" title="Top matches" href="/employer/candidates" link="All candidates" />
          {data.candidates.length === 0 ? (
            <p className="border-y border-ink-100 py-5 text-sm text-ink-600">No scored candidates match yet. New ones appear as they finish their AI interview.</p>
          ) : (
            <>
              <MatchHeader />
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {matches.map((m) => (
                  <MatchRow key={m.id} {...m} />
                ))}
              </ul>
              <ScoreBands />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** "Monday 9 November" in the employer's timezone. */
function dashDate(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** The booked slot of an interview, if one was picked. */
function slotDate(iv: InterviewRow): Date | null {
  const pick = iv.selectedSlot === 1 ? iv.slot1 : iv.selectedSlot === 2 ? iv.slot2 : iv.selectedSlot === 3 ? iv.slot3 : null;
  if (!pick) return null;
  const d = new Date(pick);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function load(employerId: string): Promise<Loaded> {
  const db = getDb();
  const [employerRow, projectRows, proposalRows, sheetRows, interviewRows, cartRows, metRows, payable] = await Promise.all([
    db
      .select({ companyName: schema.employers.companyName, country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
      .from(schema.employers)
      .where(eq(schema.employers.id, employerId))
      .limit(1),
    db.select().from(schema.projects).where(eq(schema.projects.employerId, employerId)).orderBy(desc(schema.projects.createdAt)),
    db
      .select({
        status: schema.proposals.status,
        projectId: schema.proposals.projectId,
        internId: schema.proposals.internId,
        offerDetails: schema.proposals.offerDetails,
        createdAt: schema.proposals.createdAt,
        hiredAt: schema.proposals.hiredAt,
      })
      .from(schema.proposals)
      .where(eq(schema.proposals.employerId, employerId)),
    db
      .select({ id: schema.timesheets.id })
      .from(schema.timesheets)
      .where(and(eq(schema.timesheets.employerId, employerId), eq(schema.timesheets.status, "submitted"))),
    db
      .select()
      .from(schema.interviews)
      .where(and(eq(schema.interviews.employerId, employerId), inArray(schema.interviews.status, ["pending", "proposed", "scheduled"]))),
    db
      .select({ internId: schema.employerCartItems.internId, projectId: schema.employerCartItems.projectId })
      .from(schema.employerCartItems)
      .where(and(eq(schema.employerCartItems.employerId, employerId), inArray(schema.employerCartItems.listType, ["cart", "checkout"]))),
    db
      .select({ internId: schema.interviews.internId })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.employerId, employerId), inArray(schema.interviews.status, ["scheduled", "completed"]))),
    payableCheckout(employerId),
  ]);

  const employer = employerRow[0];
  // Top matches leave out anyone already proposed to.
  const proposedTo = new Set(proposalRows.map((p) => p.internId));
  // Same set as the nav badge and the Shortlist page: no live proposal yet
  // (a declined or expired one puts them back in play).
  const live = new Set(proposalRows.filter((p) => !["rejected", "withdrawn", "expired"].includes(p.status)).map((p) => p.internId));
  const waiting = cartRows.filter((c) => !live.has(c.internId));
  const shortlisted = new Set(waiting.map((c) => c.internId)).size;
  const shortlistEntries = new Set(waiting.map((c) => `${c.projectId}:${c.internId}`)).size;

  const now = Date.now();
  const upcoming = interviewRows
    .filter((iv) => iv.status === "scheduled")
    .map((iv) => ({ iv, at: slotDate(iv), end: meetingEndsAt(iv) }))
    .filter((x) => x.at && (x.end ?? x.at.getTime()) > now)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());

  // Candidates who match the skills this employer is hiring for, best score
  // first; the top of the pool when no open project lists skills. Same pool
  // rule as the candidate browser.
  const wanted = Array.from(
    new Set(projectRows.filter((p) => isProjectOpen(p.status, p.takenDownAt)).flatMap((p) => (p.skills as string[]) ?? [])),
  ).map((s) => s.toLowerCase());
  const pool = await db
    .select({ user: schema.users, onboarding: schema.internOnboarding })
    .from(schema.users)
    .innerJoin(schema.internOnboarding, eq(schema.users.id, schema.internOnboarding.userId))
    .where(and(...candidatePoolClauses()))
    .orderBy(desc(scoreExpr()), desc(schema.internOnboarding.updatedAt))
    .limit(60);
  // `intern_onboarding.user_id` is not unique; one row per intern.
  const seen = new Set<string>();
  const profiles = pool
    .filter((r) => !seen.has(r.user.id) && Boolean(seen.add(r.user.id)))
    .filter((r) => !proposedTo.has(r.user.id))
    .map((r) => toCandidateProfile(r.user, r.onboarding));
  // Skills may carry a level ("React · Advanced"): match on the name.
  const matching = wanted.length ? profiles.filter((c) => c.skills.some((s) => wanted.includes(skillBaseName(s).toLowerCase()))) : profiles;
  const candidates = (matching.length ? matching : profiles).slice(0, 4);
  // Each match against the open project it fits best (newest wins a tie): the
  // heart saves to that project and the row says how well they fit it.
  const openRows = projectRows.filter((p) => isProjectOpen(p.status));
  const fit: Record<string, Fit | null> = {};
  for (const c of candidates) {
    const have = new Set(c.skills.map((s) => skillBaseName(s).toLowerCase()));
    let best: Fit | null = null;
    for (const p of openRows) {
      const skills = ((p.skills as string[]) ?? []).map((s) => s.toLowerCase());
      const hit = skills.filter((s) => have.has(s)).length;
      if (!best || hit > best.hit) best = { projectId: p.id, projectName: p.projectName, hit, of: skills.length, skills };
    }
    fit[c.id] = best;
  }

  // The next meeting's candidate: initials and photo only, as everywhere before a hire.
  const nextIv = upcoming[0]?.iv ?? null;
  let nextWith: Loaded["nextWith"] = null;
  if (nextIv) {
    const [row] = await db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.users.id, schema.internOnboarding.userId))
      .where(eq(schema.users.id, nextIv.internId))
      .limit(1);
    if (row) {
      const person = toCandidateProfile(row.user, row.onboarding);
      await attachPhotos(db, [person]);
      nextWith = {
        initials: person.initials,
        photoUrl: person.photoUrl ?? null,
        projectName: projectRows.find((p) => p.id === nextIv.projectId)?.projectName ?? null,
      };
    }
  }

  await attachPhotos(db, candidates);
  const presence = await presenceOf(candidates.map((c) => c.id)).catch((err) => {
    console.error("[employer/dashboard] presence", err);
    return {} as Record<string, PresenceLabel | null>;
  });

  return {
    companyName: employer?.companyName ?? "",
    timezone: timezoneForLocation(employer ?? {}),
    projects: projectRows,
    proposals: proposalRows,
    metInternIds: Array.from(new Set(metRows.map((r) => r.internId))),
    submittedSheets: sheetRows.length,
    pendingInterviews: interviewRows.filter((i) => i.status === "pending" || i.status === "proposed").length,
    nextInterview: nextIv,
    shortlisted,
    shortlistEntries,
    toPay: payable.lines.length,
    candidates,
    presence,
    wanted,
    fit,
    saved: cartRows.map((c) => `${c.projectId}:${c.internId}`),
    shortlistInternIds: Array.from(new Set(cartRows.map((c) => c.internId))),
    nextWith,
  };
}
