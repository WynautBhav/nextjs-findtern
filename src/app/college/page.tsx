import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { Plus } from "lucide-react";

import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { CopyText } from "@/components/college/copy-text";
import { ButtonLink } from "@/components/ui/button";
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

  const owed = waiting.reduce((n, s) => n + s.offersPending, 0);
  const legacy = seat && !hasDriveOrder ? seat : null;
  const link = "font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700";

  return (
    <div className="space-y-8">
      <PageHead
        title={ctx.college.name}
        lede={`Placement console${ctx.college.city ? ` · ${ctx.college.city}` : ""}`}
        action={
          liveDrive ? undefined : (
            <ButtonLink href="/college/drives/new">
              <Plus className="size-4" aria-hidden /> New drive
            </ButtonLink>
          )
        }
      />

      {liveDrive && presence ? (
        <PresenceLive
          driveId={liveDrive.id}
          driveTitle={liveDrive.title}
          endsAt={liveDrive.endsAt.toISOString()}
          initial={{ ...presence }}
        />
      ) : null}

      <Overview
        lead={
          <>
            <LeadStat
              label="Joined Findtern"
              value={coverage.rosterSize ? <>{coverage.joined}<span className="text-2xl text-ink-600">/{coverage.rosterSize}</span></> : students.length}
              note={
                coverage.rosterSize
                  ? `${joinedPct}% of your roster${coverage.notJoined.length ? `; ${coverage.notJoined.length} still to join.` : "."}`
                  : "Upload your roster to see who is missing."
              }
              action={{ label: coverage.rosterSize ? "See who has not joined" : "Upload your roster", href: "/college/roster" }}
            />
            {!liveDrive ? (
              <p className="mt-6 max-w-sm text-sm text-ink-700">
                No drive is open right now.{" "}
                <Link href="/college/drives/new" className={link}>Set one up</Link> and share its link with the companies you invite.
              </p>
            ) : null}
          </>
        }
        rest={
          <StatList
            items={[
              { label: "AI interview done", value: `${interviewed.length} of ${students.length}`, hint: students.length ? `${students.length - interviewed.length} still to take it` : "No students yet" },
              { label: "Median Findtern score", value: med === null ? "—" : med.toFixed(1), hint: scores.length ? `out of 10, across ${scores.length} interviewed` : "Appears after the first interview" },
              { label: "Offers waiting on reply", value: owed || "None", hint: waiting.length ? `${waiting.length} student${waiting.length === 1 ? "" : "s"} to chase` : undefined },
            ]}
          />
        }
      />

      <DriveDashboard liveDrive={Boolean(liveDrive)} />

      <Section title="Student code" hint="Give it only to your own students: it is the only way they join your college.">
        {ctx.college.code ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <code className="select-all break-all font-mono text-2xl font-semibold text-ink-900">{ctx.college.code}</code>
            <CopyText text={ctx.college.code} label="Copy code" />
          </div>
        ) : (
          <p className="text-sm text-ink-700">Your college has no code yet. Ask Findtern to issue one.</p>
        )}
        {legacy ? (
          <details className="mt-4 max-w-xl text-sm">
            <summary className="min-h-10 cursor-pointer py-2 font-medium text-ink-700 hover:text-ink-900">Legacy seat code</summary>
            <div className="space-y-2 pb-2 text-ink-700">
              <p>Read-only. Existing students keep using it; new drives use the roster codes sent to each student.</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="select-all break-all font-mono text-base font-semibold text-ink-900">{legacy.code}</code>
                <span className="nums">
                  {legacy.used} of {legacy.cap ?? "unlimited"} used{legacy.cap === null ? "" : ` · ${Math.max(0, legacy.cap - legacy.used)} left`}
                </span>
                <Link href="/college/seats" className={link}>Seats and invoices</Link>
              </p>
              {legacy.cap !== null && legacy.cap - legacy.used <= legacy.cap * 0.1 ? (
                <p className="font-medium text-signal">{paid.batches === 0 ? AWAITING_FIRST_PAYMENT : "Ask Findtern for more seats."}</p>
              ) : null}
            </div>
          </details>
        ) : null}
      </Section>

      <StudentTable students={students.map(toStudentRow)} now={now} />
    </div>
  );
}
