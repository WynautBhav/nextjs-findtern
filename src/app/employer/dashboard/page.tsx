import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, CalendarClock, ClipboardCheck, CreditCard, FolderPlus, Send, ShoppingBag } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { EmptyScene, SectionHead, Surface } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth";
import { displayNameOf, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { proposalOutcome } from "@/lib/proposals";
import { PLAN_NAME, bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Employer Dashboard · Findtern",
  robots: { index: false, follow: false },
};

type ProjectRow = typeof schema.projects.$inferSelect;

type Task = {
  count: number;
  label: string;
  detail: string;
  href: string;
  cta: string;
  Icon: typeof Send;
};

/**
 * Employer home.
 *
 * Built around one question: what is waiting on me? The top of the page is a
 * short list of real pending actions (pay for accepted offers, approve hours,
 * confirm interviews, send proposals to the shortlist), each with its own
 * button. Below it, the pipeline as four numbers that add up, then projects
 * and candidates who match those projects. One primary action in the header;
 * nothing else repeats it.
 */
export default async function EmployerDashboard() {
  const session = await requireRole("employer");
  const employerId = session.uid;
  // No company profile or no project yet: finish onboarding first.
  await requireEmployerSetup(employerId);

  let companyName = "";
  let projects: ProjectRow[] = [];
  let proposals: { status: string; projectId: string }[] = [];
  let submittedSheets = 0;
  let pendingInterviews = 0;
  let upcomingInterviews = 0;
  let shortlisted = 0;
  let candidates: CandidateProfile[] = [];
  let nameUnlocked = new Set<string>();
  let loadFailed = false;

  try {
    const db = getDb();
    nameUnlocked = await hiredInternIds(db, employerId).catch(() => new Set<string>());

    const [employerRow, projectRows, proposalRows, sheetRows, interviewRows, cartRows] = await Promise.all([
      db
        .select({ companyName: schema.employers.companyName })
        .from(schema.employers)
        .where(eq(schema.employers.id, employerId))
        .limit(1),
      db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.employerId, employerId))
        .orderBy(desc(schema.projects.createdAt)),
      db
        .select({
          status: schema.proposals.status,
          projectId: schema.proposals.projectId,
          internId: schema.proposals.internId,
        })
        .from(schema.proposals)
        .where(eq(schema.proposals.employerId, employerId)),
      db
        .select({ id: schema.timesheets.id })
        .from(schema.timesheets)
        .where(and(eq(schema.timesheets.employerId, employerId), eq(schema.timesheets.status, "submitted"))),
      db
        .select({ status: schema.interviews.status, selectedSlot: schema.interviews.selectedSlot })
        .from(schema.interviews)
        .where(eq(schema.interviews.employerId, employerId)),
      db
        .select({ internId: schema.employerCartItems.internId })
        .from(schema.employerCartItems)
        .where(eq(schema.employerCartItems.employerId, employerId)),
    ]);

    companyName = employerRow[0]?.companyName ?? "";
    projects = projectRows;
    proposals = proposalRows;
    submittedSheets = sheetRows.length;
    pendingInterviews = interviewRows.filter((i) => i.status === "pending" || i.status === "proposed").length;
    upcomingInterviews = interviewRows.filter((i) => i.status === "scheduled").length;
    // "No proposal yet" means exactly that: anyone already proposed to is out.
    const proposedTo = new Set(proposalRows.map((p) => p.internId));
    shortlisted = new Set(cartRows.map((c) => c.internId).filter((id) => !proposedTo.has(id))).size;

    // Candidates who match the skills this employer is hiring for, best score
    // first. Falls back to the top of the pool when no project lists skills.
    // Same pool rule as the candidate browser: no un-interviewed, hidden or
    // unlisted interns.
    const wanted = Array.from(
      new Set(projectRows.filter((p) => p.status === "active").flatMap((p) => (p.skills as string[]) ?? [])),
    ).map((s) => s.toLowerCase());
    const pool = await db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.users.id, schema.internOnboarding.userId))
      .where(and(...candidatePoolClauses()))
      .orderBy(desc(scoreExpr()), desc(schema.internOnboarding.updatedAt))
      .limit(40);
    // `intern_onboarding.user_id` is not unique; one card per intern.
    const seen = new Set<string>();
    const profiles = pool
      .filter((r) => !seen.has(r.user.id) && Boolean(seen.add(r.user.id)))
      .map((r) => toCandidateProfile(r.user, r.onboarding));
    const matching = wanted.length
      ? profiles.filter((c) => c.skills.some((s) => wanted.includes(s.toLowerCase())))
      : profiles;
    candidates = (matching.length ? matching : profiles).slice(0, 5);
    await attachPhotos(db, candidates, nameUnlocked).catch(() => undefined);
  } catch (err) {
    console.error("Failed to load employer dashboard:", err);
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <EmptyScene
        art
        title="Couldn't load your dashboard"
        body="We couldn't load your dashboard right now. Nothing is wrong with your account - try again in a moment."
        who="Us - connection issue"
      />
    );
  }

  const awaiting = proposals.filter((p) => p.status === "sent" || p.status === "interview_scheduled").length;
  const accepted = proposals.filter((p) => p.status === "accepted").length;
  const hired = proposals.filter((p) => p.status === "hired").length;
  const declined = proposals.filter((p) => proposalOutcome(p.status) === "lost").length;

  const tasks: Task[] = [
    {
      count: accepted,
      label: accepted === 1 ? "offer accepted, payment due" : "offers accepted, payment due",
      detail: "The hire completes once you pay. Names unlock after payment.",
      href: "/employer/checkout",
      cta: "Go to checkout",
      Icon: CreditCard,
    },
    {
      count: submittedSheets,
      label: submittedSheets === 1 ? "timesheet to approve" : "timesheets to approve",
      detail: "Interns are paid on approved hours only.",
      href: "/employer/timesheets",
      cta: "Review hours",
      Icon: ClipboardCheck,
    },
    {
      count: pendingInterviews,
      label: pendingInterviews === 1 ? "interview waiting on a slot" : "interviews waiting on a slot",
      detail: "Pick or confirm a time so the candidate can prepare.",
      href: "/employer/schedule",
      cta: "Open schedule",
      Icon: CalendarClock,
    },
    {
      count: upcomingInterviews,
      label: upcomingInterviews === 1 ? "interview coming up" : "interviews coming up",
      detail: "The meeting link is on each slot in your schedule.",
      href: "/employer/schedule#upcoming",
      cta: "See times",
      Icon: CalendarClock,
    },
    {
      count: shortlisted,
      label: shortlisted === 1 ? "shortlisted candidate, no proposal yet" : "shortlisted candidates, no proposal yet",
      detail: "They are in your cart. Send a proposal before someone else does.",
      href: "/employer/cart",
      cta: "Open cart",
      Icon: ShoppingBag,
    },
  ].filter((t) => t.count > 0);

  const proposalsByProject = new Map<string, { total: number; won: number }>();
  for (const p of proposals) {
    const row = proposalsByProject.get(p.projectId) ?? { total: 0, won: 0 };
    row.total += 1;
    if (proposalOutcome(p.status) === "won") row.won += 1;
    proposalsByProject.set(p.projectId, row);
  }
  const activeProjects = projects.filter((p) => p.status === "active");
  const shownProjects = [...activeProjects, ...projects.filter((p) => p.status !== "active")].slice(0, 5);

  return (
    <div className="space-y-10">
      <div>
        <p className="mb-1 text-sm text-ink-600">{companyName || "Your company"}</p>
        <PageHeader
          title={
            tasks.length
              ? `${tasks.reduce((n, t) => n + t.count, 0)} things need you`
              : proposals.length
                ? "You're all caught up"
                : "Let's make your first hire"
          }
          action={
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/employer/projects" variant="outline" size="sm" className="min-h-11">
                <FolderPlus className="size-4" aria-hidden />
                New project
              </ButtonLink>
              <ButtonLink href="/employer/candidates" variant="primary" size="sm" className="min-h-11">
                Find candidates
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          }
        />
      </div>

      {/* What is waiting on you */}
      {tasks.length ? (
        <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
          {tasks.map((t) => (
            <li key={t.href} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                <t.Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-ink-900">
                  <span className="tabular-nums">{t.count}</span> {t.label}
                </p>
                <p className="mt-0.5 text-sm text-ink-600">{t.detail}</p>
              </div>
              <Link
                href={t.href}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-[10px] border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50 sm:self-auto"
              >
                {t.cta}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </Surface>
      ) : null}

      {/* Pipeline: four numbers that add up */}
      <section>
        <SectionHead
          title="Proposal pipeline"
          action={
            <Link href="/employer/proposals" className="text-sm font-medium text-brand-700 hover:underline">
              All proposals
            </Link>
          }
        />
        <Surface className="grid grid-cols-2 overflow-hidden sm:grid-cols-4">
          {[
            { label: "Awaiting reply", value: awaiting, note: "sent, no answer yet" },
            { label: "Accepted", value: accepted, note: "payment due", warn: accepted > 0 },
            { label: "Hired", value: hired, note: "paid and placed" },
            { label: "Declined or expired", value: declined, note: "closed" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "px-5 py-4",
                i % 2 === 1 && "border-l border-ink-100",
                i >= 2 && "border-t border-ink-100 sm:border-t-0",
                i === 2 && "sm:border-l",
              )}
            >
              <p className="text-[13px] text-ink-600">{s.label}</p>
              <p
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
                  s.warn ? "text-accent-700" : "text-ink-900",
                )}
              >
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-ink-600">{s.note}</p>
            </div>
          ))}
        </Surface>
      </section>

      <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Projects */}
        <section className="min-w-0">
          <SectionHead
            title="Projects"
            hint={`${activeProjects.length} open of ${projects.length}`}
            action={
              projects.length ? (
                <Link href="/employer/projects" className="text-sm font-medium text-brand-700 hover:underline">
                  Manage
                </Link>
              ) : null
            }
          />
          {projects.length === 0 ? (
            <EmptyScene
              title="No projects yet"
              body="A project tells us the skills you need, so candidates are matched to it. It takes about five minutes."
              next={{ label: "Create a project", href: "/employer/projects" }}
              who="You - about five minutes"
            />
          ) : (
            <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
              {shownProjects.map((p) => {
                const stats = proposalsByProject.get(p.id) ?? { total: 0, won: 0 };
                const skills = ((p.skills as string[]) ?? []).slice(0, 3);
                const open = p.status === "active";
                return (
                  <li key={p.id}>
                    <Link
                      href={
                        skills.length
                          ? `/employer/candidates?skills=${encodeURIComponent(((p.skills as string[]) ?? []).join(","))}`
                          : "/employer/candidates"
                      }
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50/70"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={cn("size-1.5 shrink-0 rounded-full", open ? "bg-success" : "bg-ink-300")}
                          />
                          <span className="truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                            {p.projectName}
                          </span>
                          <span className="sr-only">{open ? "(open)" : "(closed)"}</span>
                        </p>
                        <p className="mt-0.5 truncate pl-3.5 text-[13px] text-ink-600">
                          {skills.join(" · ") || "No skills listed"}
                        </p>
                      </div>
                      <p className="text-right text-[13px] tabular-nums text-ink-600">
                        <span className="font-medium text-ink-800">{stats.total}</span> sent
                        {stats.won ? (
                          <>
                            {" "}· <span className="font-medium text-success">{stats.won}</span> accepted
                          </>
                        ) : null}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </Surface>
          )}
        </section>

        {/* Candidates matching the open projects */}
        <section className="min-w-0">
          <SectionHead
            title="Matches for your projects"
            action={
              <Link href="/employer/candidates" className="text-sm font-medium text-brand-700 hover:underline">
                Browse all
              </Link>
            }
          />
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-600">No scored candidates yet.</p>
          ) : (
            <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
              {candidates.map((c) => {
                const band = bandFor(c.score);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/employer/intern/${encodeURIComponent(c.id)}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50/70"
                    >
                      <CandidateAvatar
                        photoUrl={c.photoUrl}
                        initials={c.initials}
                        className="size-9 rounded-full text-xs font-semibold"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                          {displayNameOf(c, nameUnlocked.has(c.id))}
                        </span>
                        <span className="block truncate text-[13px] text-ink-600">
                          {c.skills.slice(0, 3).join(" · ") || c.location || "Profile in progress"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-ink-900">
                          {c.score.toFixed(1)}
                        </span>
                        <span className="block text-[11px] text-ink-600">{PLAN_NAME[band.id]}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </Surface>
          )}
        </section>
      </div>

    </div>
  );
}
