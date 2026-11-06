import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, CalendarClock, Check, ClipboardCheck, CreditCard, FolderPlus, Hourglass, Search, ShoppingBag } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { RowAvatar, ScoreBadge } from "@/components/employer/candidate-row-parts";
import { SaveToggle } from "@/components/employer/candidate-card";
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
import { scopeLabel } from "@/lib/db/schema";
import { timezoneForLocation } from "@/lib/timezones";
import { formatSlotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

type ProjectRow = typeof schema.projects.$inferSelect;
type InterviewRow = typeof schema.interviews.$inferSelect;

type Task = {
  count: number;
  label: string;
  detail: string;
  href: string;
  cta: string;
  Icon: typeof CreditCard;
  /** False when the next move is someone else's (the candidate picking a time). */
  yours?: boolean;
};

type Loaded = {
  companyName: string;
  timezone: string;
  projects: ProjectRow[];
  proposals: { status: string; projectId: string; internId: string; offerDetails: unknown }[];
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
  /** Who the next meeting is with (initials and photo only) and for which project. */
  nextWith: { initials: string; photoUrl: string | null; projectName: string | null } | null;
};

/** Borders for the four pipeline figures (2×2 on phones, 1×4 from sm). */
const FIGURE_RULES = ["pl-0", "border-l", "max-sm:border-t max-sm:pl-0 sm:border-l", "border-l max-sm:border-t"];

type Fit = { projectId: string; projectName: string; hit: number; of: number; skills: string[] };

/**
 * Employer home.
 *
 * Built around one question: what is waiting on me? The hero says it in a
 * sentence and carries the pipeline as four figures that add up; below it,
 * the real pending actions (pay for accepted offers, approve hours, confirm
 * interviews, send proposals to the shortlist), each with its own button.
 * Then the open projects and the candidates who match them, initials only
 * (bug sheet 7 NC r41), best score first.
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
  const awaiting = bucket.filter((b) => b === "open").length;
  const isToPay = (s: string) => s === "accepted" || s === "processing";
  const accepted = bucket.filter((b) => b === "accepted").length;
  const hired = bucket.filter((b) => b === "hired").length;
  const declined = bucket.filter((b) => b === "closed").length;

  const tasks: Task[] = (
    [
      {
        count: data.toPay,
        label: data.toPay === 1 ? "payment due" : "payments due",
        // One line; checkout lists each charge and its due date.
        detail: `Pay to turn ${data.toPay === 1 ? "an accepted offer" : `${data.toPay} accepted offers`} into ${data.toPay === 1 ? "a hire" : "hires"}. Checkout shows each charge and when it's due.`,
        href: "/employer/checkout",
        cta: "Go to checkout",
        Icon: CreditCard,
      },
      {
        count: data.submittedSheets,
        label: data.submittedSheets === 1 ? "timesheet to review" : "timesheets to review",
        detail: "Interns are paid on approved hours only.",
        href: "/employer/timesheets",
        cta: "Review hours",
        Icon: ClipboardCheck,
      },
      {
        count: data.pendingInterviews,
        label: data.pendingInterviews === 1 ? "meeting waiting on the candidate" : "meetings waiting on candidates",
        detail: "They pick one of the three times you offered. Send a reminder from your schedule if it's been a while.",
        href: "/employer/schedule",
        cta: "Open schedule",
        Icon: CalendarClock,
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
        cta: "Open shortlist",
        Icon: ShoppingBag,
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const openProjects = projects.filter((p) => isProjectOpen(p.status, p.takenDownAt));
  const shownProjects = [...openProjects, ...projects.filter((p) => !isProjectOpen(p.status, p.takenDownAt))].slice(0, 5);
  const byProject = new Map<string, { total: number; toPay: number; hired: number }>();
  for (const p of proposals) {
    const row = byProject.get(p.projectId) ?? { total: 0, toPay: 0, hired: 0 };
    row.total += 1;
    if (isToPay(p.status)) row.toPay += 1;
    if (p.status === "hired") row.hired += 1;
    byProject.set(p.projectId, row);
  }
  // Your moves first; the meetings a candidate still has to pick sit with the
  // other things waiting on candidates, never in the to-do list.
  const mine = tasks.filter((t) => t.yours !== false);
  const theirs = tasks.filter((t) => t.yours === false);

  const next = data.nextInterview;
  const nextAt = next ? slotDate(next) : null;
  const joinLive = Boolean(next?.meetingLink && next && isMeetingLinkLive(next));

  // The pipeline as type, each figure opening the matching Proposals tab.
  const pipeline = [
    { n: awaiting, label: "Awaiting a reply", status: "open" },
    { n: accepted, label: "Accepted · to pay", status: "accepted" },
    { n: hired, label: "Hired", status: "hired" },
    { n: declined, label: "Declined or expired", status: "closed" },
  ];

  return (
    <div>
      <PageHead
        title="Dashboard"
        lede={data.companyName || undefined}
        action={
          <>
            <ButtonLink href="/employer/projects/new" variant="outline" size="sm" className="max-sm:flex-1">
              <FolderPlus className="size-4" aria-hidden />
              New project
            </ButtonLink>
            <ButtonLink href="/employer/candidates" variant="outline" size="sm" className="max-sm:flex-1">
              <Search className="size-4" aria-hidden />
              Find candidates
            </ButtonLink>
          </>
        }
      />

      {/* Phone order: to-do, next meeting, waiting on candidates, matches,
          projects. From xl the left column is the work, the right one people. */}
      <div className="flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-x-12">
        <div className="contents xl:block xl:min-w-0 xl:space-y-10">
          <section aria-labelledby="todo-h" className="order-1">
            <h2 id="todo-h" className="mb-4 text-lg font-semibold tracking-[-0.01em] text-ink-900">
              Waiting on you
            </h2>
            {mine.length ? (
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {mine.map((t, i) => (
                  <li key={t.href} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]">
                    {/* The count leads the row: type, not an icon tile. */}
                    <span className="nums text-right text-2xl font-semibold leading-none text-ink-900">{t.count}</span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-ink-900">{t.label.charAt(0).toUpperCase() + t.label.slice(1)}</p>
                      <p className="mt-0.5 text-sm text-ink-600">{t.detail}</p>
                    </div>
                    <ButtonLink
                      href={t.href}
                      // The first (most urgent) row carries the page's one filled button.
                      variant={i === 0 ? "primary" : "outline"}
                      size="sm"
                      className="col-start-2 min-h-11 justify-self-start rounded-full px-4 sm:col-start-auto sm:justify-self-end"
                    >
                      {t.cta}
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 border-y border-ink-100 py-5">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink-900">{proposals.length ? "Nothing needs you right now" : "Make your first hire"}</p>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {proposals.length
                      ? "No payments, hours or shortlisted candidates are waiting on you."
                      : "Shortlist candidates ranked by their Findtern Score, meet them, and send a proposal."}
                  </p>
                </div>
                <ButtonLink href="/employer/candidates" variant="primary" size="sm" className="min-h-11 rounded-full px-4">
                  Find candidates
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            )}
          </section>

          {proposals.length || theirs.length ? (
            <section aria-labelledby="theirs-h" className="order-3">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 id="theirs-h" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
                  Proposals
                </h2>
                <Link href="/employer/proposals" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  All proposals
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              {proposals.length ? (
                <dl className="grid grid-cols-2 border-y border-ink-100 sm:grid-cols-4">
                  {pipeline.map((f, i) => (
                    <div
                      key={f.status}
                      // Hairline rules between figures: one row of four, or two by two on a phone.
                      className={cn("relative min-w-0 px-4 py-4 border-ink-100", FIGURE_RULES[i])}
                    >
                      <dt className="text-sm text-ink-600">
                        <Link
                          href={`/employer/proposals?status=${f.status}`}
                          className="outline-none after:absolute after:inset-0 after:content-[''] hover:text-ink-900 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
                        >
                          {f.label}
                        </Link>
                      </dt>
                      <dd className="nums mt-1 text-2xl font-semibold leading-none text-ink-900">{f.n}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {/* "Awaiting a reply" is the offers; this adds the meetings, the other thing on candidates. */}
              {theirs.map((t) => (
                <p key={t.href} className="mt-3 flex items-center gap-1.5 text-sm text-ink-600">
                  <Hourglass className="size-4 shrink-0 text-ink-400" aria-hidden />
                  <span>
                    Also waiting on candidates:{" "}
                    <Link href={t.href} className="font-medium text-brand-700 underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                      <span className="nums">{t.count}</span> {t.count === 1 ? "meeting time to pick" : "meeting times to pick"}
                    </Link>
                  </span>
                </p>
              ))}
            </section>
          ) : null}

          <section aria-labelledby="projects-h" className="order-5">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <h2 id="projects-h" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
                  Projects
                </h2>
                <p className="mt-1 text-sm text-text-subtle">
                  {openProjects.length > shownProjects.length ? `Newest ${shownProjects.length} of ${openProjects.length} open` : `${openProjects.length} open of ${projects.length}`}
                </p>
              </div>
              <Link href="/employer/projects" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                All projects
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {projects.length === 0 ? (
              <EmptyScene
                title="No projects yet"
                body="A project tells us the skills you need, so candidates are matched to it. It takes about five minutes."
                next={{ label: "Create a project", href: "/employer/projects/new" }}
                who="You - about five minutes"
              />
            ) : (
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {shownProjects.map((p, i) => {
                  const stats = byProject.get(p.id) ?? { total: 0, toPay: 0, hired: 0 };
                  const skills = ((p.skills as string[]) ?? []).slice(0, 4);
                  const open = isProjectOpen(p.status, p.takenDownAt);
                  return (
                    // Three on a phone, so the list stays a short scroll.
                    <li key={p.id} className={i >= 3 ? "max-xl:hidden" : undefined}>
                      <Link
                        href={`/employer/candidates?project=${encodeURIComponent(p.id)}`}
                        className="group -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-apple-sm px-2 py-4 transition-colors hover:bg-ink-50/70 focus-visible:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="line-clamp-2 break-words text-base font-medium text-ink-900 group-hover:text-brand-700">{p.projectName}</span>
                            {open ? null : <Pill tone="closed">Closed</Pill>}
                          </p>
                          {/* Two lines, then cut: a phone showed half a project name (QA-117). */}
                          <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                            {scopeLabel(p.scopeOfWork)}
                            {skills.length ? ` · ${skills.join(", ")}` : ""}
                          </p>
                        </div>
                        <p className="nums flex items-center gap-3 text-right text-sm text-ink-600">
                          {/* "N sent" alone says little: it shows once there is a payment or a hire beside it. */}
                          {stats.toPay || stats.hired ? (
                            <span>
                              {stats.toPay ? (
                                <span className="block text-ink-900">
                                  <span className="font-semibold">{stats.toPay}</span> to pay
                                </span>
                              ) : null}
                              {stats.hired ? (
                                <span className="block text-success">
                                  <span className="font-semibold">{stats.hired}</span> hired
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          <span className="hidden items-center gap-1 font-medium text-brand-700 sm:inline-flex">
                            Candidates
                            <ArrowRight className="size-3.5" aria-hidden />
                          </span>
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="contents xl:block xl:min-w-0 xl:space-y-10">
          {next && nextAt ? (
            <section aria-labelledby="next-h" className="order-2">
              <h2 id="next-h" className="mb-4 text-lg font-semibold tracking-[-0.01em] text-ink-900">
                Next meeting
              </h2>
              <div className="border-y border-ink-100 py-4">
                <div className="flex items-center gap-3">
                  {data.nextWith ? <RowAvatar photoUrl={data.nextWith.photoUrl} initials={data.nextWith.initials} className="size-12 sm:size-12" /> : null}
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink-900">
                      {data.nextWith ? `${data.nextWith.initials} · ` : ""}
                      <span className="font-medium">{formatSlotTime(nextAt, data.timezone)}</span>
                    </p>
                    <p className="truncate text-sm text-ink-600">
                      {data.nextWith?.projectName ?? "No project linked"} · {data.timezone.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {joinLive && next.meetingLink ? (
                    // Filled only when nothing else on the page is: one primary per view.
                    <JoinMeetingButton link={next.meetingLink} size="sm" variant={mine.length ? "outline" : "primary"} />
                  ) : null}
                  <ButtonLink href="/employer/schedule" variant={joinLive ? "ghost" : "outline"} size="sm" className="min-h-11">
                    <CalendarClock className="size-4" aria-hidden />
                    Open schedule
                  </ButtonLink>
                </div>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="matches-h" className="order-4 min-w-0">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="matches-h" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
                Top matches
              </h2>
              <Link href="/employer/candidates" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                All candidates
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {data.candidates.length === 0 ? (
              <p className="border-y border-ink-100 py-5 text-sm text-ink-600">No scored candidates match yet. New ones appear as they finish their AI interview.</p>
            ) : (
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {data.candidates.map((c) => {
                  const presence = data.presence[c.id] ?? null;
                  const fit = data.fit[c.id] ?? null;
                  // Tint against the project the row names, so chips and "n of m" agree.
                  const { shown: skills, more, isWanted } = rowSkills(c.skills, new Set(fit?.skills ?? data.wanted), 3);
                  const where = [c.city, c.workModes.includes("remote") ? "Remote" : ""].filter(Boolean).join(" · ");
                  const href = `/employer/intern/${encodeURIComponent(c.id)}${fit ? `?project=${encodeURIComponent(fit.projectId)}` : ""}`;
                  return (
                    // The name's link stretches over the row; the score tooltip and the heart sit above it.
                    <li key={c.id} className="group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-4">
                      <RowAvatar photoUrl={c.photoUrl} initials={c.initials} presence={presence} />
                      <div className="min-w-0">
                        <p className="truncate pr-12 text-sm text-ink-600">
                          <Link
                            href={href}
                            className="text-base font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-brand-700 focus-visible:after:rounded-apple-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
                          >
                            {c.initials}
                            {presence ? <span className="sr-only">, {presence}</span> : null}
                          </Link>
                          {" · "}
                          {where || "Location not stated"}
                        </p>
                        {fit?.of ? (
                          <p className="mt-0.5 truncate pr-12 text-xs text-ink-600" title={`${fit.hit} of ${fit.of} skills for ${fit.projectName}`}>
                            <span className="nums font-medium text-ink-900">
                              {fit.hit} of {fit.of}
                            </span>{" "}
                            skills for {fit.projectName}
                          </p>
                        ) : null}
                        <div className="mt-1.5">
                          <ScoreBadge score={c.score} scored={c.scored} />
                        </div>
                        {skills.length ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Skills">
                            {skills.map((k) =>
                              isWanted(k) ? (
                                <li key={k} className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-100 px-2.5 text-[13px] font-medium text-brand-900">
                                  <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden />
                                  {skillBaseName(k)}
                                  <span className="sr-only"> (matches)</span>
                                </li>
                              ) : (
                                <li key={k} className="inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-medium text-ink-700 ring-1 ring-inset ring-ink-200">
                                  {skillBaseName(k)}
                                </li>
                              ),
                            )}
                            {more ? (
                              <li className="inline-flex h-7 items-center px-1 text-[13px] font-medium text-ink-600">
                                +{more}
                                <span className="sr-only"> more skills</span>
                              </li>
                            ) : null}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-ink-600">No skills listed</p>
                        )}
                      </div>
                      {fit ? (
                        <span className="absolute right-0 top-3 z-10">
                          <SaveToggle internId={c.id} projectId={fit.projectId} shortlisted={data.saved.includes(`${fit.projectId}:${c.id}`)} />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
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
  const [employerRow, projectRows, proposalRows, sheetRows, interviewRows, cartRows, payable] = await Promise.all([
    db
      .select({ companyName: schema.employers.companyName, country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
      .from(schema.employers)
      .where(eq(schema.employers.id, employerId))
      .limit(1),
    db.select().from(schema.projects).where(eq(schema.projects.employerId, employerId)).orderBy(desc(schema.projects.createdAt)),
    db
      .select({ status: schema.proposals.status, projectId: schema.proposals.projectId, internId: schema.proposals.internId, offerDetails: schema.proposals.offerDetails })
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
    nextWith,
  };
}
