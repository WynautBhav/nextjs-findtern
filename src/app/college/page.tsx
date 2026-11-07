import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { StatCard, StatGrid } from "@/components/college/stat-card";
import { PresenceLive } from "@/components/college/presence-live";
import { StudentTable } from "@/components/college/student-table";
import { aiStatusLabel } from "@/lib/college/labels";
import {
  eligibleStudents,
  presenceSnapshot,
  requireCollegeContext,
  rosterCoverage,
  studentsForCollegeAdmin,
} from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";
import { getDb, schema } from "@/lib/db";
import { AWAITING_FIRST_PAYMENT } from "@/lib/college/seat-paid";
import { paidSeatTotal } from "@/lib/college/seat-gate";
import { PageHead } from "@/components/app/primitives";
import { collegeHasDriveOrder } from "@/lib/drives/dashboard-db";
import { DriveDashboard } from "./drive-dashboard";

export const dynamic = "force-dynamic";

/** Request time, for "online"/"x min ago" labels. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function CollegeDashboard() {
  const ctx = await requireCollegeContext();
  const now = requestTime();

  const [students, coverage, [liveDrive], [seat], paid, hasDriveOrder] = await Promise.all([
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
  ]);

  const presence = liveDrive
    ? await presenceSnapshot(ctx.college.id, (await eligibleStudents(liveDrive)).map((s) => s.userId))
    : null;

  const interviewed = students.filter((s) => aiStatusLabel(s.aiStatus).done);
  const scores = interviewed.map((s) => s.score).filter((v): v is number => v !== null);
  const med = median(scores);
  const waiting = students.filter((s) => s.offersPending > 0);
  const joinedPct = coverage.rosterSize ? Math.round((coverage.joined / coverage.rosterSize) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHead
        title={ctx.college.name}
        lede={`Placement console${ctx.college.city ? ` · ${ctx.college.city}` : ""}.${ctx.college.code && !hasDriveOrder ? ` College code ${ctx.college.code}: students find your college by name or this code.` : ""}`}
      />

      {liveDrive && presence ? (
        <PresenceLive
          driveId={liveDrive.id}
          driveTitle={liveDrive.title}
          endsAt={liveDrive.endsAt.toISOString()}
          initial={{ ...presence }}
        />
      ) : null}

      <DriveDashboard />

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

      <StatGrid cols={4} variant="strip">
        <StatCard
          label="Joined Findtern"
          value={coverage.rosterSize ? `${coverage.joined}/${coverage.rosterSize}` : students.length}
          hint={
            coverage.rosterSize
              ? `${joinedPct}% of your roster${coverage.notJoined.length ? `; ${coverage.notJoined.length} still to join` : ""}`
              : "Upload your roster to track who's missing"
          }
          href="/college/roster"
        />
        <StatCard
          label="AI interview done"
          value={`${interviewed.length}/${students.length}`}
          hint={students.length ? `${students.length - interviewed.length} still to take it` : "No students yet"}
          tone="neutral"
        />
        <StatCard
          label="Median Findtern score"
          value={med === null ? "—" : med.toFixed(1)}
          hint={scores.length ? `out of 10, across ${scores.length} interviewed` : "Appears after the first interview"}
          tone="neutral"
        />
        <StatCard
          label="Offers waiting on reply"
          value={waiting.reduce((n, s) => n + s.offersPending, 0)}
          hint={waiting.length ? `${waiting.length} student${waiting.length === 1 ? "" : "s"} to chase` : "Nobody is sitting on an offer"}
          tone={waiting.length ? "warning" : "neutral"}
        />
      </StatGrid>

      {!liveDrive ? (
        <p className="text-sm text-text-subtle">
          No drive is live right now.{" "}
          <Link href="/college/drives/new" className="font-medium text-brand-700 hover:underline">
            Set one up
          </Link>{" "}
          and share the link with the employers you invite.
        </p>
      ) : null}

      <StudentTable students={students.map(toStudentRow)} now={now} />
    </div>
  );
}
