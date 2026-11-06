import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { StatCard, StatGrid } from "@/components/college/stat-card";
import { PresenceLive } from "@/components/college/presence-live";
import { StudentTable } from "@/components/college/student-table";
import {
  eligibleStudents,
  presenceSnapshot,
  requireCollegeContext,
  rosterCoverage,
  studentsForCollegeAdmin,
  tpoStudentList,
} from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { AWAITING_FIRST_PAYMENT } from "@/lib/college/seat-paid";
import { paidSeatTotal } from "@/lib/college/seat-gate";
import { PageHead } from "@/components/app/primitives";

export const dynamic = "force-dynamic";

/** Request time, for "online"/"x min ago" labels. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

export default async function CollegeDashboard() {
  const ctx = await requireCollegeContext();
  const now = requestTime();

  const [students, coverage, [liveDrive], [seat], paid] = await Promise.all([
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
  ]);

  const presence = liveDrive
    ? await presenceSnapshot(ctx.college.id, (await eligibleStudents(liveDrive)).map((s) => s.userId))
    : null;

  const list = await tpoStudentList(ctx, students);
  const count = (k: "registered" | "onboardingDone" | "aiDone") => list.filter((r) => r.tpo?.[k]).length;
  const registered = count("registered");
  const seatsLeft = seat && seat.cap !== null ? Math.max(0, seat.cap - seat.used) : null;

  return (
    <div className="space-y-6">
      <PageHead
        title={ctx.college.name}
        lede={`Placement console${ctx.college.city ? ` · ${ctx.college.city}` : ""}.${ctx.college.code ? ` College code ${ctx.college.code}: students find your college by name or this code.` : ""}`}
      />

      {liveDrive && presence ? (
        <PresenceLive
          driveId={liveDrive.id}
          driveTitle={liveDrive.title}
          endsAt={liveDrive.endsAt.toISOString()}
          initial={{ ...presence }}
        />
      ) : null}

      {seat ? (
        <section className="rounded-apple-md border border-ink-200 bg-surface p-4" aria-label="Your student code">
          <p className="text-sm text-ink-600">Your student code, different from the college code above. Share it with students: it waives their AI interview fee and verifies them with your college.</p>
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

      <StatGrid cols={4} variant="strip">
        <StatCard
          label="Seats left"
          value={seatsLeft ?? "—"}
          hint={seat ? `of ${paid.seats} paid` : AWAITING_FIRST_PAYMENT}
          tone={seat && seatsLeft === 0 ? "warning" : "neutral"}
          href="/college/seats"
        />
        <StatCard label="Code used" value={seat?.used ?? 0} hint={seat ? "students who redeemed your code" : "Issued once your first batch is paid"} tone="neutral" />
        <StatCard label="Registered" value={registered} hint={coverage.rosterSize ? `of ${coverage.rosterSize} on your roster` : "Upload your roster to compare"} href="/college/roster" />
        <StatCard
          label="AI interview done"
          value={count("aiDone")}
          hint={list.length ? `${list.length - count("aiDone")} still to take it` : "No students yet"}
          tone="neutral"
        />
      </StatGrid>

      <dl className="grid divide-y divide-ink-100 rounded-apple-md border border-ink-200 bg-surface text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          ["Seats purchased", paid.seats],
          ["On your roster", coverage.rosterSize],
          ["Onboarding done", count("onboardingDone")],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-3">
            <dt className="text-ink-600">{label}</dt>
            <dd className="nums font-semibold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>

      {!liveDrive ? (
        <p className="text-sm text-text-subtle">
          No drive is live right now.{" "}
          <Link href="/college/drives/new" className="font-medium text-brand-700 hover:underline">
            Set one up
          </Link>{" "}
          and share the link with the employers you invite.
        </p>
      ) : null}

      <StudentTable students={list} now={now} />
    </div>
  );
}
