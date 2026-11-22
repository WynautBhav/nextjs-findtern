import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { PresenceLive } from "@/components/college/presence-live";
import { CopyText } from "@/components/college/copy-text";
import { aiStatusLabel, yearLabel } from "@/lib/college/labels";
import { BatchRibbon, BranchBoard, ScoreCurve, TopOfBatch } from "@/components/college/overview-charts";
import { CollegeMark } from "@/components/employer/drive-parts";
import { pendingApprovalCount } from "@/lib/college/approvals";
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
export default async function CollegeOverview() {
  const ctx = await requireCollegeContext();

  const [all, coverage, [liveDrive], [seat], paid, hasDriveOrder, pendingLeaves, toAccept, [unpaid]] = await Promise.all([
    studentsForCollegeAdmin(ctx),
    rosterCoverage(ctx.college.id),
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
    pendingApprovalCount(ctx.college.id, ctx.college.emailDomains),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.collegeSeatBatches)
      .where(and(eq(schema.collegeSeatBatches.collegeId, ctx.college.id), eq(schema.collegeSeatBatches.status, "pending"))),
  ]);

  const students = all.filter((s) => s.status === "verified");
  const presence = liveDrive
    ? await presenceSnapshot(ctx.college.id, (await eligibleStudents(liveDrive)).map((s) => s.userId))
    : null;

  const interviewed = students.filter((s) => aiStatusLabel(s.aiStatus).done);
  const scores = interviewed.map((s) => s.score).filter((v): v is number => v !== null);
  const med = median(scores);
  const waiting = students.filter((s) => s.offersPending > 0);
  const notJoined = coverage.rows.filter((r) => r.state === "not_joined").length;
  const callsWaiting = students.filter((s) => s.callsPending > 0);
  const unpaidBatches = unpaid?.n ?? 0;

  const decisions = [
    toAccept > 0
      ? { href: "/college/approvals", count: toAccept, title: `${toAccept === 1 ? "student is" : "students are"} waiting to be added`, body: "They already have a Findtern account. Accept the ones who are yours." }
      : null,
    pendingLeaves > 0
      ? { href: "/college/approvals#leave", count: pendingLeaves, title: `${pendingLeaves === 1 ? "student has" : "students have"} asked to leave`, body: "They stay in your college until you decide." }
      : null,
    waiting.length > 0
      ? { href: "/college/students?show=offers", count: waiting.length, title: `${waiting.length === 1 ? "student is" : "students are"} sitting on an offer`, body: "A reminder from you usually gets a reply the same day." }
      : null,
    callsWaiting.length > 0
      ? { href: "/college/drives", count: callsWaiting.length, title: `${callsWaiting.length === 1 ? "student has" : "students have"} not answered an employer's call`, body: "The drive is still open. Ask them to accept or decline." }
      : null,
    unpaidBatches > 0
      ? { href: "/college/seats", count: unpaidBatches, title: `seat ${unpaidBatches === 1 ? "batch is" : "batches are"} waiting for payment`, body: "Bank details and the invoice are on the Seats page." }
      : null,
  ].filter((d): d is NonNullable<typeof d> => d !== null);

  const withOffers = students.filter((s) => s.proposals > 0).length;
  const hired = students.filter((s) => s.hired > 0).length;
  const now = requestTime();
  const today = [
    { n: students.filter((s) => now - s.joinedAt.getTime() < 86_400_000).length, one: "student joined", many: "students joined" },
    { n: students.reduce((t, s) => t + s.offersNew, 0), one: "new offer", many: "new offers" },
    { n: students.reduce((t, s) => t + s.hiredNew, 0), one: "hire", many: "hires" },
  ].filter((x) => x.n > 0);
  const listed = Math.max(coverage.rosterSize, students.length);
  const funnel = [
    { label: coverage.rosterSize ? "On your list" : "Students", value: listed, hint: coverage.rosterSize ? (notJoined ? `${notJoined} not joined yet` : "Everyone has joined") : "Add your list to track who is missing", href: "/college/roster" },
    { label: "Verified on Findtern", value: students.length, hint: toAccept ? `${toAccept} more waiting for you` : "Visible in your drives", href: "/college/students" },
    { label: "AI interview done", value: interviewed.length, hint: med === null ? "Scores appear after the first interview" : `Median score ${med.toFixed(1)} of 10`, href: "/college/students?show=no_interview" },
    { label: "Got an offer", value: withOffers, hint: waiting.length ? `${waiting.length} still to reply` : "From employers on Findtern", href: "/college/students?show=offers" },
    { label: "Hired", value: hired, hint: hired ? "Working with an employer" : "Hires show here", href: "/college/students?show=hired" },
  ];

  const topStudents = interviewed
    .filter((s) => s.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)
    .map((s) => ({ userId: s.userId, name: `${s.firstName} ${s.lastName}`.trim() || s.email, meta: [s.year ? yearLabel(s.year) : null, s.branch].filter(Boolean).join(" · "), score: s.score ?? 0 }));
  const byBranch = new Map<string, { students: number; interviewed: number; sum: number; scored: number }>();
  for (const s of students) {
    const b = byBranch.get(s.branch ?? "Branch not set") ?? { students: 0, interviewed: 0, sum: 0, scored: 0 };
    b.students++;
    if (aiStatusLabel(s.aiStatus).done) b.interviewed++;
    if (s.score !== null) {
      b.sum += s.score;
      b.scored++;
    }
    byBranch.set(s.branch ?? "Branch not set", b);
  }
  const branchRows = [...byBranch.entries()]
    .map(([branch, b]) => ({ branch, students: b.students, interviewed: b.interviewed, avg: b.scored ? b.sum / b.scored : null }))
    .sort((a, b) => b.students - a.students)
    .slice(0, 8);

  const firstRun = students.length === 0 && coverage.rosterSize === 0;

  return (
    <div className="space-y-6">
      <HeroPanel className="rise">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <CollegeMark name={ctx.college.name} logoUrl={ctx.college.logoUrl} className="size-14 rounded-2xl bg-white/10 text-base ring-1 ring-white/20" />
            <div className="min-w-0">
              <h1 className="text-balance text-[clamp(1.75rem,3.4vw,2.5rem)] font-light leading-tight tracking-[-0.03em]">{ctx.college.name}</h1>
              <p className="mt-1 text-sm text-on-dark-subtle">Placement office{ctx.college.city ? `, ${ctx.college.city}` : ""}</p>
              {!firstRun ? (
                <p className="nums mt-2 text-sm text-on-dark">
                  <span className="text-on-dark-subtle">Last 24 hours: </span>
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
            <ButtonLink href="/college/roster" variant="outlineLight">Add students</ButtonLink>
          </div>
        </div>
        <BatchRibbon stages={funnel} />
      </HeroPanel>

      {firstRun ? (
        <Surface className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Three steps to your first campus drive</h2>
          <ol className="mt-4 grid gap-5 sm:grid-cols-3">
            {[
              { n: 1, title: "Add your students", body: "Paste or upload your list: name, phone and email. Students who are already on Findtern show up for you to accept.", href: "/college/roster", cta: "Add student list" },
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

      {decisions.length > 0 ? (
        <section aria-labelledby="needs-you">
          <h2 id="needs-you" className="mb-2 text-sm font-semibold text-ink-900">Needs your decision</h2>
          <Surface>
            <ul className="divide-y divide-ink-100">
              {decisions.map((d) => (
                <li key={d.href} className="relative flex items-center gap-4 px-5 py-4 hover:bg-ink-50/60">
                  <span className="nums w-10 shrink-0 text-right text-2xl font-semibold tracking-[-0.02em] text-ink-900">{d.count}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={d.href} className="font-medium text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500">
                      {d.title}
                    </Link>
                    <p className="text-sm text-text-subtle">{d.body}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-ink-500" aria-hidden />
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}

      {liveDrive && presence ? (
        <PresenceLive driveId={liveDrive.id} driveTitle={liveDrive.title} endsAt={liveDrive.endsAt.toISOString()} initial={{ ...presence }} />
      ) : null}

      {scores.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Surface className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">How your batch scores</h2>
              <p className="text-sm text-text-subtle"><span className="nums">{scores.length}</span> interviewed, out of 10</p>
            </div>
            <ScoreCurve scores={scores} median={med} />
          </Surface>
          <Surface className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Top of the batch</h2>
              <Link href="/college/students" className="text-sm font-medium text-brand-700 hover:underline">All students</Link>
            </div>
            <TopOfBatch students={topStudents} />
          </Surface>
        </div>
      ) : null}

      {branchRows.length > 1 ? (
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Branch by branch</h2>
            <p className="text-sm text-text-subtle">Filled part: students who have taken the AI interview</p>
          </div>
          <div className="mt-5 lg:columns-2 lg:gap-x-10 [&_li]:break-inside-avoid">
            <BranchBoard rows={branchRows} />
          </div>
        </Surface>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Your college code</h2>
          {ctx.college.code ? (
            <>
              <p className="mt-1 text-sm text-text-subtle">Students type this when they sign up. Give it only to your own students: whoever has it joins as verified.</p>
              <p className="mt-3 flex flex-wrap items-center gap-3">
                <code className="select-all font-mono text-2xl font-semibold tracking-[0.12em] text-ink-900">{ctx.college.code}</code>
                <CopyText text={ctx.college.code} label="Copy code" />
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-subtle">Findtern has not issued your code yet. Write to us and we will set it up.</p>
          )}
        </Surface>
        <Surface className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Campus drive link</h2>
          <p className="mt-1 text-sm text-text-subtle">
            {liveDrive
              ? `"${liveDrive.title}" is open. Employers who open its link see your verified students only.`
              : "No drive is open right now. Create a link, send it to the employers you invite, and they see your verified students only."}
          </p>
          <p className="mt-3">
            <ButtonLink href={liveDrive ? `/college/drives/${liveDrive.id}` : "/college/drives/new"} variant="outline">
              {liveDrive ? "Open the drive" : "Create a link"}
            </ButtonLink>
          </p>
        </Surface>
      </div>

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
