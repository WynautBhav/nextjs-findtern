import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { PresenceLive } from "@/components/college/presence-live";
import { CopyText } from "@/components/college/copy-text";
import { aiStatusLabel } from "@/lib/college/labels";
import { ScoreCurve, TopStudents } from "@/components/college/overview-charts";
import { ScoreVsCgpa } from "@/components/college/score-vs-cgpa";
import { yearLabel } from "@/lib/college/labels";
import { CollegeMark } from "@/components/employer/drive-parts";
import { candidatesFor } from "@/lib/college/approvals";
import { onYourListCount } from "@/lib/college/count-rules";
import { eligibleStudents, presenceSnapshot, requireCollegeContext, rosterCoverage, studentsForCollegeAdmin } from "@/lib/college/scope";
import { pendingLeaveCount } from "@/lib/college/leave-request-read";
import { getDb, schema } from "@/lib/db";
import { AWAITING_FIRST_PAYMENT } from "@/lib/college/seat-paid";
import { paidSeatTotal } from "@/lib/college/seat-gate";
import { Surface } from "@/components/app/primitives";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { ButtonLink } from "@/components/ui/button";
import { collegeHasDriveOrder } from "@/lib/drives/dashboard-db";
import { DriveDashboard } from "./drive-dashboard";
import { BatchCampusWalk } from "@/components/college/campus-walk";
import { HeroModes, type HeroMode } from "@/components/college/hero-modes/hero-modes";
import { masterRowsForCollege } from "@/lib/college/master-data";
import { readinessForMany } from "@/lib/college/student-readiness-db";
import type { HiddenReason } from "@/lib/college/student-readiness";
import { overviewModes } from "@/lib/college/overview-modes";
import { AttentionTiles, type AttentionTile } from "@/components/college/attention-tiles";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Request time, for the "last 24 hours" line. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The placement office's first screen answers one question: what needs me today? Decisions first (students to
 * accept, leave requests), then the live drive, then how the batch is doing. The student register itself lives
 * on /college/students.
 */
export default async function CollegeOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCollegeContext();
  const sp = await searchParams;
  const heroMode: HeroMode = sp.mode === "categories" || sp.mode === "placement" ? sp.mode : "students";
  const heroDesign = Math.max(0, Math.min(9, (Number(sp.design) || 1) - 1));

  // One read of who the officer can accept: the tile counts it and the roster marks those students "Waiting for you" (as Students does).
  const candidates = candidatesFor(ctx.college.id, ctx.college.emailDomains);
  const [all, coverage, [liveDrive], [seat], paid, hasDriveOrder, pendingLeaves, toAccept, [unpaid], master] = await Promise.all([
    studentsForCollegeAdmin(ctx),
    candidates.then((c) => rosterCoverage(ctx.college.id, new Set(c.map((x) => x.email.toLowerCase())))),
    getDb()
      .select()
      .from(schema.collegeDrives)
      .where(
        and(
          eq(schema.collegeDrives.collegeId, ctx.college.id),
          isNull(schema.collegeDrives.revokedAt),
          // timestamp columns hold UTC wall time; a bare now() would read them in the DB session zone (as scope.ts avoids).
          lte(schema.collegeDrives.startsAt, sql`(now() AT TIME ZONE 'UTC')`),
          gt(schema.collegeDrives.endsAt, sql`(now() AT TIME ZONE 'UTC')`),
        ),
      )
      .orderBy(schema.collegeDrives.endsAt)
      .limit(1),
    getDb()
      .select({ code: schema.promoCodes.code, used: schema.promoCodes.usedCount, cap: schema.promoCodes.maxUsages })
      .from(schema.promoCodes)
      .where(eq(schema.promoCodes.collegeId, ctx.college.id))
      .limit(1),
    paidSeatTotal(getDb(), ctx.college.id),
    collegeHasDriveOrder(ctx.college.id),
    pendingLeaveCount(ctx.college.id),
    candidates.then((c) => c.length),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.collegeSeatBatches)
      .where(and(eq(schema.collegeSeatBatches.collegeId, ctx.college.id), eq(schema.collegeSeatBatches.status, "pending"))),
    masterRowsForCollege(ctx),
  ]);

  const students = all.filter((s) => s.status === "verified");
  const [presence, readiness] = await Promise.all([
    liveDrive ? eligibleStudents(liveDrive).then((e) => presenceSnapshot(ctx.college.id, e.map((s) => s.userId))) : null,
    readinessForMany(students.map((s) => s.userId)),
  ]);
  // Hidden from employers, one reason each (the first that blocks), for the Hidden profiles panel.
  const hidden: Partial<Record<HiddenReason, number>> = {};
  for (const r of readiness.values()) if (r.hidden) hidden[r.hidden] = (hidden[r.hidden] ?? 0) + 1;

  const interviewed = students.filter((s) => aiStatusLabel(s.aiStatus).done);
  const scores = interviewed.map((s) => s.score).filter((v): v is number => v !== null);
  const med = median(scores);
  const waiting = students.filter((s) => s.offersPending > 0);
  const notJoined = coverage.rows.filter((r) => r.state === "not_joined").length;
  const callsWaiting = students.filter((s) => s.callsPending > 0);
  const unpaidBatches = unpaid?.n ?? 0;

  const noInterview = students.length - interviewed.length;
  const meetingsWaiting = master.filter((r) => r.verified && r.meetings.waiting > 0).length;
  // What needs the officer, most urgent first. Every tile always shows; a zero reads "All clear".
  const attention: AttentionTile[] = [
    { key: "approvals", label: "Waiting for approval", value: toAccept, href: "/college/approvals", hint: "Accept the students who are yours", clearHint: "Nobody is waiting" },
    { key: "leave", label: "Asked to leave", value: pendingLeaves, href: "/college/approvals#leave", hint: "They stay until you decide", clearHint: "No leave requests" },
    { key: "offers", label: "Sitting on an offer", value: waiting.length, href: "/college/students?show=offers", hint: "A reminder gets a same-day reply", clearHint: "Every offer is answered" },
    { key: "calls", label: "Drive meets not answered", value: callsWaiting.length, href: "/college/students?show=calls", hint: "Employers waiting in a drive", clearHint: "No drive meets waiting" },
    { key: "meetings", label: "Meetings not answered", value: meetingsWaiting, href: "/college/master-data?status=verified&outcome=meet-waiting", hint: "Interview invites with no reply yet", clearHint: "Every invite is answered" },
    { key: "interview", label: "AI interview not done", value: noInterview, href: "/college/students?show=no_interview", hint: "Employers see them after it", clearHint: "Everyone is interviewed" },
    { key: "joined", label: "Not joined yet", value: notJoined, href: "/college/students?show=not_joined", hint: "On your list, no account yet", clearHint: coverage.rosterSize ? "Everyone has joined" : "Add your list to track this" },
    { key: "seats", label: "Seats to pay for", value: unpaidBatches, href: "/college/seats", hint: "The invoice is on Seats", clearHint: "Every batch is paid" },
  ];

  const withOffers = students.filter((s) => s.proposals > 0).length;
  const hired = students.filter((s) => s.hired > 0).length;
  const now = requestTime();
  const today = [
    { n: students.filter((s) => now - s.joinedAt.getTime() < 86_400_000).length, one: "student joined", many: "students joined" },
    { n: students.reduce((t, s) => t + s.offersNew, 0), one: "new offer", many: "new offers" },
    { n: students.reduce((t, s) => t + s.hiredNew, 0), one: "hire", many: "hires" },
  ].filter((x) => x.n > 0);
  // Roster rows plus verified students who are not on it (FN-04): the funnel adds up with the "Not joined yet" tile and the lists they open.
  const listed = onYourListCount(coverage.rows.map((r) => r.email), students.map((s) => s.email));
  const funnel = [
    { label: coverage.rosterSize ? "On your list" : "Students", value: listed, hint: coverage.rosterSize ? (notJoined ? `${notJoined} not joined yet` : "Everyone has joined") : "Add your list to track who is missing", href: coverage.rosterSize ? "/college/students?show=not_joined" : "/college/approvals#add" },
    { label: "Verified on Findtern", value: students.length, hint: toAccept ? `${toAccept} more waiting for you` : "Visible in your drives", href: "/college/students" },
    { label: "AI interview done", value: interviewed.length, hint: med === null ? "Scores appear after the first interview" : `Median score ${med.toFixed(1)} of 10`, href: "/college/students?show=interviewed" },
    { label: "Got an offer", value: withOffers, hint: waiting.length ? `${waiting.length} still to reply` : "From employers on Findtern", href: "/college/students?show=offered" },
    { label: "Hired", value: hired, hint: hired ? "Working with an employer" : "Hires show here", href: "/college/students?show=hired" },
  ];

  const nameOf = (s: (typeof students)[number]) => `${s.firstName} ${s.lastName}`.trim() || s.email;
  const scorePoints = interviewed.flatMap((s) => (s.score !== null && s.cgpa !== null ? [{ userId: s.userId, name: nameOf(s), score: s.score, cgpa: s.cgpa }] : []));
  const topStudents = interviewed
    .filter((s) => s.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.cgpa ?? 0) - (a.cgpa ?? 0))
    .slice(0, 7)
    .map((s) => ({ userId: s.userId, name: nameOf(s), meta: [s.year ? yearLabel(s.year) : null, s.branch].filter(Boolean).join(" · "), score: s.score ?? 0, cgpa: s.cgpa }));

  const firstRun = students.length === 0 && coverage.rosterSize === 0;

  return (
    <div className="space-y-6">
      <HeroPanel className="rise">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <CollegeMark name={ctx.college.name} logoUrl={ctx.college.logoUrl} className="size-14 rounded-2xl bg-white/10 text-base ring-1 ring-white/20" />
            <div className="min-w-0">
              <h1 className="text-balance text-[clamp(1.75rem,3.4vw,2.5rem)] font-light leading-tight tracking-[-0.03em]">{ctx.college.name}</h1>
              <p className="mt-1 text-sm text-on-dark">Placement office{ctx.college.city ? `, ${ctx.college.city}` : ""}</p>
              {!firstRun ? (
                <p className="nums mt-2 text-sm text-on-dark">
                  <span className="text-on-dark">Last 24 hours: </span>
                  {today.length
                    ? today.map((x, i) => (
                        <span key={x.one} className="whitespace-nowrap">
                          {i > 0 ? " · " : ""}
                          {x.n} {x.n === 1 ? x.one : x.many}
                        </span>
                      ))
                    : "no new joins, offers or hires"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
            <ButtonLink href="/college/drives/new" variant="white">New campus drive link</ButtonLink>
            <ButtonLink href="/college/approvals#add" variant="outlineLight">Add students</ButtonLink>
          </div>
        </div>
        <HeroModes students={<BatchCampusWalk stages={funnel} hidden={hidden} />} data={overviewModes(master)} initialMode={heroMode} initialDesign={heroDesign} rows={master} collegeId={ctx.college.id} now={now} />
      </HeroPanel>

      {firstRun ? (
        <Surface className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Three steps to your first campus drive</h2>
          <ol className="mt-4 grid gap-5 sm:grid-cols-3">
            {[
              { n: 1, title: "Add your students", body: "Paste or upload your list: name, phone and email. Students who are already on Findtern show up for you to accept.", href: "/college/approvals#add", cta: "Add student list" },
              { n: 2, title: "Students join", body: ctx.college.code ? `New students sign up and enter your college code ${ctx.college.code}. Each takes the AI interview once.` : "New students sign up with the code Findtern gives you. Each takes the AI interview once.", href: "/college/students", cta: "See students" },
              { n: 3, title: "Invite employers", body: "Create a campus drive link and send it to the companies you invite. They see only your verified students.", href: "/college/drives/new", cta: "Create a link" },
            ].map((step) => (
              <li key={step.n} className="border-t border-ink-200 pt-4">
                <p className="nums text-sm font-medium text-text-subtle">Step {step.n}</p>
                <h3 className="mt-1 text-[0.9375rem] font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.body}</p>
                <Link href={step.href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  {step.cta} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </Surface>
      ) : null}

      <section aria-labelledby="needs-you">
        <h2 id="needs-you" className="mb-3 text-sm font-semibold text-ink-900">Needs your attention</h2>
        <AttentionTiles tiles={attention} />
      </section>

      {liveDrive && presence ? (
        <PresenceLive driveId={liveDrive.id} driveTitle={liveDrive.title} startsAt={liveDrive.startsAt.toISOString()} endsAt={liveDrive.endsAt.toISOString()} initial={{ ...presence }} />
      ) : null}

      {scores.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Surface className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">How your batch scores</h2>
              <p className="text-sm text-text-subtle"><span className="nums">{scores.length}</span> interviewed · dashed line at 6, where most employers filter</p>
            </div>
            <ScoreCurve scores={scores} median={med} />
          </Surface>
          <Surface className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Top students</h2>
              <Link href="/college/students" className="text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">All students</Link>
            </div>
            <TopStudents students={topStudents} />
          </Surface>
        </div>
      ) : null}

      {scorePoints.length > 0 ? (
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Findtern score vs CGPA</h2>
            <p className="text-sm text-text-subtle"><span className="nums">{scorePoints.length}</span> students with both · cut at score 7 and CGPA 7.5</p>
          </div>
          <ScoreVsCgpa points={scorePoints} />
        </Surface>
      ) : null}

      {/* What the office hands out: the code to students, the link to employers. One strip, two halves. */}
      <Surface className="grid overflow-hidden md:grid-cols-2 md:divide-x md:divide-ink-100">
        <section aria-labelledby="share-code" className="p-5 sm:p-6">
          <h2 id="share-code" className="text-sm font-semibold text-ink-900">For your students: the college code</h2>
          {ctx.college.code ? (
            <>
              <p className="mt-3 flex flex-wrap items-center gap-3">
                <code className="select-all font-mono text-[1.75rem] font-medium tracking-[0.14em] text-ink-900">{ctx.college.code}</code>
                <CopyText text={ctx.college.code} label="Copy code" />
              </p>
              <p className="mt-2 text-sm text-text-subtle">Whoever signs up with it joins as verified. Give it only to your own students.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-subtle">Findtern has not issued your code yet. Write to us and we will set it up.</p>
          )}
        </section>
        <section aria-labelledby="share-drive" className="border-t border-ink-100 p-5 sm:p-6 md:border-t-0">
          <h2 id="share-drive" className="text-sm font-semibold text-ink-900">For employers: the campus drive link</h2>
          <p className="mt-3 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-ink-900">{liveDrive ? liveDrive.title : "No drive open"}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-subtle">
            <span>{liveDrive ? "Employers who open its link see your verified students only." : "Create a link and send it to the employers you invite."}</span>
            <ButtonLink href={liveDrive ? `/college/drives/${liveDrive.id}` : "/college/drives/new"} variant="outline" size="sm">
              {liveDrive ? "Open the drive" : "Create a link"}
            </ButtonLink>
          </p>
        </section>
      </Surface>

      {hasDriveOrder ? <DriveDashboard /> : null}

      {seat && !hasDriveOrder ? (
        <section className="rounded-apple-md border border-ink-200 bg-surface p-4" aria-label="Legacy code (read-only)">
          <p className="text-sm text-ink-600"><strong>Legacy code (read-only).</strong> Existing students keep using it; new drives use roster codes sent to each student.</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <code className="select-all break-all font-mono text-xl font-semibold tracking-widest text-ink-900">{seat.code}</code>
            <span className="nums text-sm font-medium text-ink-800">
              {seat.used} of {seat.cap ?? "unlimited"} used{seat.cap === null ? "" : ` · ${Math.max(0, seat.cap - seat.used)} left`}
            </span>
            <Link href="/college/seats" className="text-sm font-medium underline underline-offset-2 touch:inline-flex touch:min-h-11 touch:items-center">Seats and invoices</Link>
          </p>
          {seat.cap !== null && seat.cap - seat.used <= seat.cap * 0.1 ? (
            <p className="mt-2 text-sm font-medium text-amber-700">{paid.batches === 0 ? AWAITING_FIRST_PAYMENT : "Ask Findtern for more seats."}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
