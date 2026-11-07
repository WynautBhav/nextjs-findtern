import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Circle, Plus, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { BigFigure, EmptyScene, FigureStrip, HeroBand, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { Avatar } from "@/components/app/avatar";
import { ScoreDial } from "@/components/app/score-dial";
import { MatchLine } from "@/components/app/match-line";
import { Callout } from "@/components/app/layout-kit";
import { bestProjectFor } from "@/components/employer/dashboard-helpers";
import { RatioBar } from "@/components/employer/kit/ratio-bar";
import { PipelineBar } from "@/components/employer/kit/pipeline-bar";
import { StatusPill } from "../projects/status-icon";
import { normalizeStatus } from "@/lib/projects/lifecycle";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { meetingEndsAt } from "@/lib/employer-interview-rules";
import { payableCheckout } from "@/lib/employer-payable";
import { isProjectOpen } from "@/lib/project-locations";
import { proposalOutcome } from "@/lib/proposals";
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

  const tasks: Task[] = (
    [
      {
        count: data.toPay,
        label: data.toPay === 1 ? "payment due" : "payments due",
        detail: "An accepted offer becomes a hire once the first payment is made: the hiring charge, plus the Month 1 charge for scores 6 and above. Each later month's charge is due 2 days before the month's pay date; you can pay up to 15 days early.",
        href: "/employer/checkout",
        cta: "Go to checkout",
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
        detail: "Book a meeting or send a proposal to move them forward.",
        href: "/employer/cart",
        cta: "Open shortlist",
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const openProjects = projects.filter((p) => isProjectOpen(p.status));
  const shownProjects = [...openProjects, ...projects.filter((p) => !isProjectOpen(p.status))].slice(0, 5);
  const byProject = new Map<string, { total: number; won: number }>();
  for (const p of proposals) {
    const row = byProject.get(p.projectId) ?? { total: 0, won: 0 };
    row.total += 1;
    if (proposalOutcome(p.status) === "won") row.won += 1;
    byProject.set(p.projectId, row);
  }
  const pipeline = [
    { key: "open", label: "In progress", count: proposals.filter((p) => proposalOutcome(p.status) === "open").length, tone: "open" as const },
    { key: "won", label: "Accepted", count: proposals.filter((p) => proposalOutcome(p.status) === "won").length, tone: "won" as const },
    { key: "lost", label: "Declined or expired", count: proposals.filter((p) => proposalOutcome(p.status) === "lost").length, tone: "lost" as const },
  ];
  const next = data.nextInterview;
  const nextAt = next ? slotDate(next) : null;
  const attention = tasks.filter((t) => t.count > 0);
  const live = openProjects.filter((p) => normalizeStatus(p.status) === "published");
  const matchProjects = (live.length ? live : openProjects).map((p) => ({ id: p.id, projectName: p.projectName, skills: (p.skills as string[]) ?? [] }));
  const postButton = (
    <ButtonLink href="/employer/projects/new">
      <Plus className="size-4" aria-hidden />
      Post an internship
    </ButtonLink>
  );

  // Nothing sent, nothing live: a checklist with the next step, not empty tables.
  const fresh = proposals.length === 0 && live.length === 0;
  const steps = [
    { done: true, label: "Company profile", href: "/employer/account" },
    { done: projects.length > 0, label: "Create an internship", href: "/employer/projects/new" },
    { done: live.length > 0, label: "Get it approved (we review within one working day)", href: "/employer/projects" },
    { done: data.shortlisted > 0 || proposals.length > 0, label: "Shortlist candidates and send a proposal", href: "/employer/candidates" },
  ];
  const yoursCount = tasks.filter((t) => t.yours !== false).length;
  const stateLine =
    yoursCount > 0
      ? `${yoursCount === 1 ? "One thing needs" : `${yoursCount} things need`} you today.`
      : "Nothing is waiting on you today.";
  const nextStep = steps.find((s) => !s.done);

  return (
    <div>
      <HeroBand
        title={data.companyName || "Dashboard"}
        lede={stateLine}
        actions={postButton}
      >
        <FigureStrip tone="dark" className="max-sm:[&>*:last-child]:col-span-2">
          <BigFigure tone="dark" label="Timesheets to review" value={data.submittedSheets} hint="Interns are paid on approved hours" href="/employer/timesheets" />
          <BigFigure tone="dark" label="Waiting on candidates" value={data.pendingInterviews} hint="Meetings they have not yet booked" href="/employer/schedule" />
          <BigFigure tone="dark" label="Shortlisted, no proposal" value={data.shortlisted} hint="Ready for a meeting or an offer" href="/employer/cart" />
        </FigureStrip>
        <div className="mt-8 border-t border-white/15 pt-6">
          <PipelineBar stages={pipeline} />
        </div>
      </HeroBand>

      {fresh ? (
        <Surface className="mb-8 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-ink-900">Get to your first hire</h2>
          <ol className="mt-4 space-y-1">
            {steps.map((st) => (
              <li key={st.label}>
                <Link
                  href={st.href}
                  className="flex min-h-11 items-center gap-3 rounded-apple-sm px-2 text-sm hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {st.done ? <CheckCircle2 className="size-5 text-brand-700" aria-hidden /> : <Circle className="size-5 text-ink-400" aria-hidden />}
                  <span className={st.done ? "text-text-subtle line-through" : "font-medium text-ink-900"}>{st.label}</span>
                  <span className="sr-only">{st.done ? "done" : st === nextStep ? "next step" : "to do"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Surface>
      ) : null}

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="attn-h">
            <SectionHead title="Needs your decision" />
            {attention.length === 0 ? (
              <Callout tone="success" title="You're all caught up">
                Nothing is waiting on you. Candidates and offers are in{" "}
                <Link href="/employer/proposals" className="font-medium underline underline-offset-2">Proposals</Link>.
              </Callout>
            ) : (
              <ul className="grid gap-3">
                {attention.map((t, i) => {
                  const mine = t.yours !== false;
                  return (
                    <li
                      key={t.href}
                      style={{ "--i": i } as React.CSSProperties}
                      className={`rise tile-lift grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3 rounded-apple-xl border bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5 ${mine ? "border-ink-200/70 border-l-4 border-l-accent" : "border-ink-200/70"}`}
                    >
                      <span className="nums w-12 text-5xl font-light leading-none tracking-[-0.05em] text-ink-900">{t.count}</span>
                      <div className="min-w-0">
                        <p className="text-base font-medium text-ink-900">{t.label}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-text-subtle">{t.detail}</p>
                      </div>
                      <ButtonLink
                        href={t.href}
                        variant={i === 0 && mine ? "primary" : "outline"}
                        size="sm"
                        className="min-h-11 max-sm:col-span-2 sm:justify-self-end"
                      >
                        {t.cta}
                      </ButtonLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="int-h">
            <SectionHead
              title="Your internships"
              hint={projects.length ? `${live.length} live of ${projects.length}` : undefined}
              action={
                <Link href="/employer/projects" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">
                  Manage all
                </Link>
              }
            />
            {projects.length === 0 ? (
              <EmptyScene
                title="No internships yet"
                body="An internship tells us the skills you need, so candidates are matched to it."
                next={{ label: "Post an internship", href: "/employer/projects/new" }}
                who="You - about five minutes"
              />
            ) : (
              <ul className="grid gap-3">
                {shownProjects.map((p, idx) => {
                  const stats = byProject.get(p.id) ?? { total: 0, won: 0 };
                  const key = normalizeStatus(p.status);
                  const action =
                    key === "published"
                      ? { href: `/employer/candidates?project=${encodeURIComponent(p.id)}`, label: "View candidates" }
                      : { href: key === "closed" ? "/employer/projects" : `/employer/projects/${p.id}/edit`, label: key === "closed" ? "View" : key === "paused" ? "Open" : key === "pending_review" ? "View" : "Edit" };
                  return (
                    <li key={p.id} style={{ "--i": idx } as React.CSSProperties} className="rise tile-lift grid grid-cols-1 gap-x-6 gap-y-3 rounded-apple-xl border border-ink-200/70 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_13rem_9.5rem] sm:items-center sm:p-5">
                      <div className="min-w-0">
                        <p className="line-clamp-2 break-words text-base font-medium text-ink-900">{p.projectName}</p>
                        <div className="mt-1.5"><StatusPill status={p.status} /></div>
                      </div>
                      <RatioBar sent={stats.total} accepted={stats.won} />
                      <ButtonLink href={action.href} variant="outline" size="sm" block className="min-h-11 sm:w-full">
                        {action.label}
                      </ButtonLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          {next && nextAt ? (
            <Surface className="border-l-4 border-l-brand-600 p-5">
              <p className="text-sm font-medium text-text-subtle">Next meeting</p>
              <p className="mt-1 text-base font-semibold text-ink-900">{formatSlotTime(nextAt, data.timezone)}</p>
              <p className="mt-0.5 text-sm text-text-subtle">Your timezone ({data.timezone.replace(/_/g, " ")})</p>
              <ButtonLink href="/employer/schedule" variant="outline" size="sm" block className="mt-4 min-h-11">
                {next.meetingLink ? <Video className="size-4" aria-hidden /> : null}
                Open in schedule
              </ButtonLink>
            </Surface>
          ) : null}

          <section aria-labelledby="top-h">
            <SectionHead
              title="Top matches"
              action={
                <Link href="/employer/candidates" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">
                  Browse all
                </Link>
              }
            />
            {data.candidates.length === 0 ? (
              <p className="text-sm text-text-subtle">No scored candidates match yet. New ones appear as they finish their AI interview.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-text-subtle">Names stay hidden until you hire.</p>
                <ol className="overflow-hidden rounded-apple-xl border border-ink-200/70 bg-gradient-to-b from-brand-50/60 to-white shadow-tile divide-y divide-ink-100">
                  {data.candidates.map((c, rank) => {
                    const fit = bestProjectFor(c.skills, matchProjects);
                    return (
                      <li key={c.id} className="space-y-2 px-4 py-3.5">
                        <p className="nums text-xs font-medium text-text-subtle">#{rank + 1}</p>
                        <div className="flex items-center gap-3">
                          <Avatar masked initials={c.initials} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink-900">Candidate {c.initials}</p>
                            <p className="truncate text-sm text-text-subtle">{c.location || "Location not shared"}</p>
                          </div>
                          {c.scored ? <ScoreDial score={c.score} axes={c.ratings} size={rank === 0 ? "md" : "sm"} showBand={false} /> : null}
                        </div>
                        {fit ? (
                          <div className="min-w-0 text-sm">
                            <p className="truncate text-text-subtle">For <span className="font-medium text-ink-800">{fit.project.projectName}</span></p>
                            <MatchLine candidateSkills={c.skills} wantedSkills={fit.project.skills} />
                          </div>
                        ) : null}
                        <ButtonLink
                          href={`/employer/intern/${encodeURIComponent(c.id)}${fit ? `?project=${encodeURIComponent(fit.project.id)}` : ""}`}
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                        >
                          View profile
                        </ButtonLink>
                      </li>
                    );
                  })}
                </ol>
              </>
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
  const matching = wanted.length ? profiles.filter((c) => c.skills.some((s) => wanted.includes(s.toLowerCase()))) : profiles;

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
    candidates: (matching.length ? matching : profiles).slice(0, 5),
  };
}
