import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, CalendarClock, ClipboardCheck, CreditCard, FolderPlus, ShoppingBag, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { EmptyScene, HeroBand, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { PresenceDot } from "@/components/app/presence-dot";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { rowSkills, skillBaseName } from "@/components/employer/candidate-view";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { meetingEndsAt } from "@/lib/employer-interview-rules";
import { payableCheckout } from "@/lib/employer-payable";
import { isProjectOpen } from "@/lib/project-locations";
import { proposalOutcome } from "@/lib/proposals";
import { scopeLabel } from "@/lib/db/schema";
import { bandFor } from "@/lib/score";
import { timezoneForLocation } from "@/lib/timezones";
import { formatSlotTime } from "@/lib/format";

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
  proposals: { status: string; projectId: string; internId: string }[];
  submittedSheets: number;
  pendingInterviews: number;
  nextInterview: InterviewRow | null;
  shortlisted: number;
  toPay: number;
  candidates: CandidateProfile[];
  presence: Record<string, PresenceLabel | null>;
  /** Lower-cased project skill names the matches are ranked on. */
  wanted: string[];
};

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
  const awaiting = proposals.filter((p) => p.status === "sent" || p.status === "interview_scheduled").length;
  // One definition for every count on the page: accepted but not paid yet vs hired (paid).
  const isToPay = (s: string) => s === "accepted" || s === "processing";
  const accepted = proposals.filter((p) => isToPay(p.status)).length;
  const hired = proposals.filter((p) => p.status === "hired").length;
  const declined = proposals.filter((p) => proposalOutcome(p.status) === "lost").length;

  const tasks: Task[] = (
    [
      {
        count: data.toPay,
        label: data.toPay === 1 ? "payment due" : "payments due",
        detail: "An accepted offer becomes a hire once the first payment is made: the hiring charge, plus the Month 1 charge for scores 6 and above. Each later month's charge is due 2 days before the month's pay date; you can pay up to 15 days early.",
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
        detail: "Book a meeting or send a proposal to move them forward.",
        href: "/employer/cart",
        cta: "Open shortlist",
        Icon: ShoppingBag,
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const openProjects = projects.filter((p) => isProjectOpen(p.status));
  const shownProjects = [...openProjects, ...projects.filter((p) => !isProjectOpen(p.status))].slice(0, 5);
  const byProject = new Map<string, { total: number; toPay: number; hired: number }>();
  for (const p of proposals) {
    const row = byProject.get(p.projectId) ?? { total: 0, toPay: 0, hired: 0 };
    row.total += 1;
    if (isToPay(p.status)) row.toPay += 1;
    if (p.status === "hired") row.hired += 1;
    byProject.set(p.projectId, row);
  }
  // The hero names the most urgent pending item: the employer's own moves first,
  // then ones waiting on someone else. "All caught up" only when nothing is pending.
  const top = tasks.find((t) => t.yours !== false) ?? tasks[0];
  const rest = tasks.filter((t) => t !== top);

  const next = data.nextInterview;
  const nextAt = next ? slotDate(next) : null;

  return (
    <div>
      <HeroBand
        eyebrow={tasks.length > 1 ? `${tasks.length} things pending` : undefined}
        // Name the first thing waiting rather than a total of different kinds
        // of things, so the headline matches the list below it.
        title={top ? `${top.count} ${top.label}` : proposals.length ? "You're all caught up" : "Let's make your first hire"}
        lede={
          top
            ? top.detail
            : proposals.length
              ? "Nothing is waiting on you. Your candidates and offers are below."
              : "Shortlist candidates ranked by their Findtern Score, meet them, and send a proposal."
        }
        actions={
          <>
            {top ? (
              <ButtonLink href={top.href} variant="accent">
                {top.cta}
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            ) : (
              <ButtonLink href="/employer/candidates" variant="accent">
                Find candidates
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            )}
            <ButtonLink href="/employer/projects?new=1" variant="outlineLight">
              <FolderPlus className="size-4" aria-hidden />
              New project
            </ButtonLink>
          </>
        }
      >
        {proposals.length ? (
          // The pipeline as one line, not four tiles: Proposals is where it's worked.
          <Link
            href="/employer/proposals"
            className="group nums inline-flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-apple-sm text-sm text-on-dark-subtle hover:text-white"
          >
            {(
              [
                [awaiting, "awaiting a reply"],
                [accepted, "accepted · to pay"],
                [hired, "hired"],
                [declined, "declined or expired"],
              ] as const
            ).map(([n, label]) => (
              <span key={label}>
                <span className="text-lg font-semibold text-white">{n}</span> {label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 font-medium text-white underline-offset-4 group-hover:underline">
              Proposals
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        ) : null}
      </HeroBand>

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          {/* The hero carries the first thing waiting; this list carries the rest,
              so nothing is said twice. Nothing waiting: the hero says so. */}
          {rest.length ? (
            <section>
              <SectionHead title={top ? "Also waiting" : "Waiting"} />
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {rest.map((t) => (
                  <li key={t.href} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto]">
                    {/* The count leads the row: type, not an icon, carries it. */}
                    <span className="nums text-right text-2xl font-semibold text-ink-900">{t.count}</span>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-ink-900">{t.label.charAt(0).toUpperCase() + t.label.slice(1)}</p>
                      <p className="mt-0.5 text-sm text-ink-600">{t.detail}</p>
                    </div>
                    <ButtonLink href={t.href} variant="outline" size="sm" className="col-start-2 min-h-11 justify-self-start sm:col-start-auto sm:justify-self-end">
                      {t.cta}
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <SectionHead
              title="Projects"
              hint={`${openProjects.length} open of ${projects.length}`}
              action={
                <Link href="/employer/projects" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">
                  Manage
                </Link>
              }
            />
            {projects.length === 0 ? (
              <EmptyScene
                title="No projects yet"
                body="A project tells us the skills you need, so candidates are matched to it. It takes about five minutes."
                next={{ label: "Create a project", href: "/employer/projects?new=1" }}
                who="You - about five minutes"
              />
            ) : (
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {shownProjects.map((p) => {
                  const stats = byProject.get(p.id) ?? { total: 0, toPay: 0, hired: 0 };
                  const skills = ((p.skills as string[]) ?? []).slice(0, 4);
                  const open = isProjectOpen(p.status);
                  return (
                    <li key={p.id}>
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
                        <p className="nums text-right text-sm text-ink-600">
                          <span className="font-semibold text-ink-900">{stats.total}</span> sent
                          {stats.toPay ? (
                            <span className="block text-ink-900">
                              <span className="font-semibold">{stats.toPay}</span> accepted · to pay
                            </span>
                          ) : null}
                          {stats.hired ? (
                            <span className="block text-success">
                              <span className="font-semibold">{stats.hired}</span> hired
                            </span>
                          ) : null}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          {next && nextAt ? (
            <Surface className="p-5">
              <p className="text-sm font-medium text-ink-600">Next meeting</p>
              <p className="mt-1 text-base font-semibold text-ink-900">{formatSlotTime(nextAt, data.timezone)}</p>
              <p className="mt-0.5 text-sm text-ink-600">Your timezone ({data.timezone.replace(/_/g, " ")})</p>
              {next.meetingLink ? (
                <ButtonLink href="/employer/schedule" size="sm" block className="mt-4 min-h-11">
                  <Video className="size-4" aria-hidden />
                  Open in schedule
                </ButtonLink>
              ) : (
                <ButtonLink href="/employer/schedule" variant="outline" size="sm" block className="mt-4 min-h-11">
                  Open schedule
                </ButtonLink>
              )}
            </Surface>
          ) : null}

          <section>
            <SectionHead
              title="Top matches"
              action={
                <Link href="/employer/candidates" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  See all candidates
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {data.candidates.length === 0 ? (
              <p className="text-sm text-ink-600">No scored candidates match yet. New ones appear as they finish their AI interview.</p>
            ) : (
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {data.candidates.map((c) => {
                  const band = bandFor(c.score);
                  const presence = data.presence[c.id] ?? null;
                  const { shown: skills, isWanted } = rowSkills(c.skills, new Set(data.wanted), 3);
                  const where = [c.city, c.workModes.includes("remote") ? "Remote" : ""].filter(Boolean).join(" · ");
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/employer/intern/${encodeURIComponent(c.id)}`}
                        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] -mx-2 items-start gap-3 rounded-apple-sm px-2 py-3.5 transition-colors hover:bg-ink-50/70 focus-visible:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      >
                        <span className="relative shrink-0">
                          <CandidateAvatar photoUrl={c.photoUrl} initials={c.initials} className="size-10 rounded-full text-xs" />
                          {presence ? (
                            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-white">
                              <PresenceDot label={presence} />
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm text-ink-600">
                            <span className="font-semibold text-ink-900 group-hover:text-brand-700">{c.initials}</span>
                            {presence ? <span className="sr-only">, {presence}</span> : null}
                            {" · "}
                            {where || "Location not stated"}
                          </span>
                          <span className="mt-0.5 block text-pretty text-sm text-ink-600">
                            {skills.length
                              ? skills.map((k, i) => (
                                  <span key={k}>
                                    {i > 0 ? " · " : ""}
                                    <span className={isWanted(k) ? "font-semibold text-ink-900" : undefined}>{skillBaseName(k)}</span>
                                  </span>
                                ))
                              : "No skills listed"}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="nums block text-lg font-semibold leading-tight text-ink-900">
                            {c.scored ? c.score.toFixed(1) : "-"}
                            <span className="sr-only"> Findtern Score</span>
                          </span>
                          <span className="block text-xs text-ink-600">{c.scored ? band.name : "Not scored yet"}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
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
      .select({ status: schema.proposals.status, projectId: schema.proposals.projectId, internId: schema.proposals.internId })
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
      .select({ internId: schema.employerCartItems.internId })
      .from(schema.employerCartItems)
      .where(and(eq(schema.employerCartItems.employerId, employerId), inArray(schema.employerCartItems.listType, ["cart", "checkout"]))),
    payableCheckout(employerId),
  ]);

  const employer = employerRow[0];
  // "No proposal yet" means exactly that: anyone already proposed to is out.
  const proposedTo = new Set(proposalRows.map((p) => p.internId));
  const shortlisted = new Set(cartRows.map((c) => c.internId).filter((id) => !proposedTo.has(id))).size;

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
    new Set(projectRows.filter((p) => isProjectOpen(p.status)).flatMap((p) => (p.skills as string[]) ?? [])),
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
    nextInterview: upcoming[0]?.iv ?? null,
    shortlisted,
    toPay: payable.lines.length,
    candidates,
    presence,
    wanted,
  };
}
