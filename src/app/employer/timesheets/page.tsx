import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { displayNameOf, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatPeriod, normaliseEntries } from "@/lib/employer-timesheets";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { EmptyScene } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Timesheets",
  robots: { index: false, follow: false },
};

/** The only status an employer acts on. Everything else is informational. */
const PENDING = new Set(["submitted"]);
const CLOSED = new Set(["approved", "rejected"]);

/**
 * Timesheet review queue.
 *
 * `timesheets.employer_id` is the scoping column. `intern_id` identifies whose
 * hours these are, but the review is the employer's, so the list is built from
 * `employer_id` - the same filter the legacy list used.
 */

type Row = {
  id: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: string;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  internNote: string | null;
  candidate: CandidateProfile | null;
  loggedDays: number;
};

export default async function EmployerTimesheets() {
  const session = await requireRole("employer");
  const uid = session.uid;

  let rows: Row[] = [];
  let awaitingReview = 0;
  let internCount = 0;
  let nameUnlocked = new Set<string>();

  try {
    const db = getDb();

    try {
      nameUnlocked = await hiredInternIds(db, uid);
    } catch {
      nameUnlocked = new Set<string>();
    }

    const timesheets = await db
      .select()
      .from(schema.timesheets)
      .where(eq(schema.timesheets.employerId, uid))
      .orderBy(desc(schema.timesheets.createdAt));

    if (timesheets.length > 0) {
      const internIds = Array.from(new Set(timesheets.map((t) => t.internId)));

      const [userRows, onboardingRows] = await Promise.all([
        db
          .select()
          .from(schema.users)
          .where(and(inArray(schema.users.id, internIds), eq(schema.users.isActive, true))),
        db.select().from(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, internIds)),
      ]);

      const usersById = new Map(userRows.map((row) => [row.id, row]));
      const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));
      internCount = usersById.size;

      rows = timesheets.map((timesheet) => {
        const entries = normaliseEntries(
          timesheet.entries,
          timesheet.periodStart,
          timesheet.periodEnd,
        );
        const user = usersById.get(timesheet.internId);

        return {
          id: timesheet.id,
          periodStart: timesheet.periodStart,
          periodEnd: timesheet.periodEnd,
          status: timesheet.status,
          submittedAt: timesheet.submittedAt,
          approvedAt: timesheet.approvedAt,
          rejectedAt: timesheet.rejectedAt,
          internNote: timesheet.internNote,
          candidate: user ? toCandidateProfile(user, onboardingByUser.get(user.id)) : null,
          loggedDays: entries.filter((entry) => entry.status).length,
        };
      });

      awaitingReview = rows.filter((row) => PENDING.has(row.status)).length;
    }
  } catch {
    // DB unavailable - render the empty queue rather than crashing.
  }

  return (
    <div>
      <PageHeader
        title="Timesheets"
        subtitle="Review and approve the hours your interns have logged each month."
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
        <Stat label="Awaiting review" value={awaitingReview} tone="warning" />
        <Stat label="Total" value={rows.length} />
        <Stat
          label="Closed"
          value={rows.filter((row) => CLOSED.has(row.status)).length}
          tone="success"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No timesheets yet"
          body="Once an intern accepts an offer and starts work, they can submit timesheets here for your approval."
          who={
            internCount > 0
              ? `${internCount} ${internCount === 1 ? "intern" : "interns"} on your account - none have submitted yet`
              : "Your interns - nothing submitted yet"
          }
        />
      ) : (
        <ul className="divide-y divide-ink-100 rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/employer/timesheets/${encodeURIComponent(row.id)}`}
                className="apple-spring apple-pressable flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {row.candidate
                      ? displayNameOf(row.candidate, nameUnlocked.has(row.candidate.id))
                      : "Intern"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-subtle">
                    {formatPeriod(row.periodStart, row.periodEnd)}
                  </p>
                  {row.internNote ? (
                    <p className="mt-1.5 line-clamp-1 text-xs text-ink-600">&ldquo;{row.internNote}&rdquo;</p>
                  ) : null}
                </div>

                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
                  <p className="text-xs tabular-nums text-text-subtle">
                    {row.loggedDays} day{row.loggedDays === 1 ? "" : "s"} logged
                  </p>

                  <span className="flex items-center gap-3">
                    <StatusPill status={row.status} />
                    <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "success";
}) {
  const valueTone =
    tone === "warning" && value > 0
      ? "text-warning"
      : tone === "success" && value > 0
        ? "text-success"
        : "text-ink-900";
  return (
    <div className="apple-spring rounded-[16px] border border-ink-200/70 bg-white p-3 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] sm:rounded-[20px] sm:p-5">
      <p className="text-pretty text-[11px] leading-tight text-text-subtle sm:text-sm sm:leading-normal">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums tracking-tight sm:mt-1 sm:text-3xl ${valueTone}`}>{value}</p>
    </div>
  );
}
