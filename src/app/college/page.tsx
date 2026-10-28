import Link from "next/link";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { StatCard, StatGrid } from "@/components/admin/stat-card";
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
import { PageHead, Pill } from "@/components/app/primitives";

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

  const [students, coverage, [liveDrive]] = await Promise.all([
    studentsForCollegeAdmin(ctx),
    rosterCoverage(ctx.college.id),
    getDb()
      .select()
      .from(schema.collegeDrives)
      .where(
        and(
          eq(schema.collegeDrives.collegeId, ctx.college.id),
          isNull(schema.collegeDrives.revokedAt),
          lte(schema.collegeDrives.startsAt, sql`now()`),
          gt(schema.collegeDrives.endsAt, sql`now()`),
        ),
      )
      .orderBy(schema.collegeDrives.endsAt)
      .limit(1),
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
        lede={`Placement console${ctx.college.city ? ` · ${ctx.college.city}` : ""}. Live from Findtern.`}
        // Said once, here (it was in the lede and again under the table).
        action={<Pill tone="neutral">Read-only</Pill>}
      />

      {liveDrive && presence ? (
        <PresenceLive
          driveId={liveDrive.id}
          driveTitle={liveDrive.title}
          endsAt={liveDrive.endsAt.toISOString()}
          initial={{ ...presence }}
        />
      ) : null}

      <StatGrid cols={4}>
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
