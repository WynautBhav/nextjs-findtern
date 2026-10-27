import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, CalendarClock, ClipboardCheck, CreditCard, FolderPlus, ShoppingBag, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { EmptyScene, HeroBand, Pill, SectionHead, StatTile, Surface } from "@/components/app/primitives";
import { requireRole } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { meetingEndsAt } from "@/lib/employer-interview-rules";
import { payableCheckout } from "@/lib/employer-payable";
import { isProjectOpen } from "@/lib/project-locations";
import { proposalOutcome } from "@/lib/proposals";
import { scopeLabel } from "@/lib/db/schema";
import { PLAN_NAME, bandFor } from "@/lib/score";
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
      <EmptyScene
        art
        title="Couldn't load your dashboard"
        body="We couldn't load your dashboard right now. Nothing is wrong with your account; try again in a moment."
        who="Us - connection issue"
        next={{ label: "Try again", href: "/employer/dashboard" }}
      />
    );
  }

  const { proposals, projects } = data;
  const awaiting = proposals.filter((p) => p.status === "sent" || p.status === "interview_scheduled").length;
  const accepted = proposals.filter((p) => p.status === "accepted" || p.status === "processing").length;
  const hired = proposals.filter((p) => p.status === "hired").length;
  const declined = proposals.filter((p) => proposalOutcome(p.status) === "lost").length;

  const tasks: Task[] = (
    [
      {
        count: data.toPay,
        label: data.toPay === 1 ? "payment due" : "payments due",
        detail: "An accepted offer becomes a hire once it's paid; a running monthly placement pays month by month.",
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
      },
      {
        count: data.shortlisted,
        label: data.shortlisted === 1 ? "shortlisted candidate, no proposal yet" : "shortlisted candidates, no proposal yet",
        detail: "Book a meeting or send a proposal before someone else does.",
        href: "/employer/cart",
        cta: "Open shortlist",
        Icon: ShoppingBag,
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const waiting = tasks.reduce((n, t) => n + t.count, 0);
  const openProjects = projects.filter((p) => isProjectOpen(p.status));
  const shownProjects = [...openProjects, ...projects.filter((p) => !isProjectOpen(p.status))].slice(0, 5);
  const byProject = new Map<string, { total: number; won: number }>();
  for (const p of proposals) {
    const row = byProject.get(p.projectId) ?? { total: 0, won: 0 };
    row.total += 1;
    if (proposalOutcome(p.status) === "won") row.won += 1;
    byProject.set(p.projectId, row);
  }
  const top = tasks[0];

  const next = data.nextInterview;
  const nextAt = next ? slotDate(next) : null;

  return (
    <div>
      <HeroBand
        eyebrow={data.companyName || "Your company"}
        title={waiting ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} you` : proposals.length ? "You're all caught up" : "Let's make your first hire"}
        lede={
          waiting
            ? "Start with the first one; each takes a minute."
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile tone="onDark" label="Awaiting a reply" value={awaiting || null} empty="None out" href="/employer/proposals" />
          <StatTile tone="onDark" label="Accepted, to pay" value={accepted || null} empty="None waiting" href="/employer/checkout" />
          <StatTile tone="onDark" label="Hired" value={hired || null} empty="No hires yet" href="/employer/orders" />
          <StatTile tone="onDark" label="Declined or expired" value={declined || null} empty="None" href="/employer/proposals" />
        </div>
      </HeroBand>

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHead title="Waiting on you" hint={waiting ? undefined : "Nothing right now."} />
            {tasks.length ? (
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {tasks.map((t) => (
                  <li key={t.href} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                      <t.Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-medium text-ink-900">
                        <span className="nums font-semibold">{t.count}</span> {t.label}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-600">{t.detail}</p>
                    </div>
                    <ButtonLink href={t.href} variant="outline" size="sm" className="min-h-11 self-start sm:self-auto">
                      {t.cta}
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </li>
                ))}
              </Surface>
            ) : (
              <p className="rounded-apple-xl border border-dashed border-ink-200 px-5 py-4 text-sm text-ink-600">
                No payments, timesheets or meetings need you. New ones show up here first.
              </p>
            )}
          </section>

          <section>
            <SectionHead
              title="Projects"
              hint={`${openProjects.length} open of ${projects.length}`}
              action={
                <Link href="/employer/projects" className="text-sm font-medium text-brand-700 hover:underline">
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
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {shownProjects.map((p) => {
                  const stats = byProject.get(p.id) ?? { total: 0, won: 0 };
                  const skills = ((p.skills as string[]) ?? []).slice(0, 4);
                  const open = isProjectOpen(p.status);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/employer/candidates?project=${encodeURIComponent(p.id)}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50/70 focus-visible:bg-ink-50 focus-visible:outline-none"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[0.9375rem] font-medium text-ink-900 group-hover:text-brand-700">{p.projectName}</span>
                            {open ? null : <Pill tone="closed">Closed</Pill>}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-ink-600">
                            {scopeLabel(p.scopeOfWork)}
                            {skills.length ? ` · ${skills.join(", ")}` : ""}
                          </p>
                        </div>
                        <p className="nums text-right text-sm text-ink-600">
                          <span className="font-semibold text-ink-900">{stats.total}</span> sent
                          {stats.won ? (
                            <span className="block text-success">
                              <span className="font-semibold">{stats.won}</span> accepted
                            </span>
                          ) : null}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </Surface>
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
              title="Matches for your projects"
              action={
                <Link href="/employer/candidates" className="text-sm font-medium text-brand-700 hover:underline">
                  Browse all
                </Link>
              }
            />
            {data.candidates.length === 0 ? (
              <p className="text-sm text-ink-600">No scored candidates match yet. New ones appear as they finish their AI interview.</p>
            ) : (
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {data.candidates.map((c) => {
                  const band = bandFor(c.score);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/employer/intern/${encodeURIComponent(c.id)}`}
                        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50/70 focus-visible:bg-ink-50 focus-visible:outline-none"
                      >
                        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
                          {c.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700">{c.initials}</span>
                          <span className="block truncate text-sm text-ink-600">{c.skills.slice(0, 3).join(", ") || c.location || "Profile in progress"}</span>
                        </span>
                        <span className="text-right">
                          <span className="nums block text-lg font-semibold leading-tight text-brand-700">{c.score.toFixed(1)}</span>
                          <span className="block text-xs text-ink-500">{PLAN_NAME[band.id]}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </Surface>
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
