import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { formatPeriod, normaliseEntries } from "@/lib/employer-timesheets";
import { StatusPill } from "@/components/employer/timesheet-parts";

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
 * `employer_id` — the same filter the legacy list used.
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
  const session = await getSession();
  const uid = session!.uid;

  let rows: Row[] = [];
  let awaitingReview = 0;
  let internCount = 0;

  try {
    const db = getDb();

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
    // DB unavailable — render the empty queue rather than crashing.
  }

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 md:text-3xl">
            Timesheets
          </h1>
          <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
            Review and approve the hours your interns have logged each month.
          </p>
        </div>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting review" value={awaitingReview} tone="warning" />
        <Stat label="Total timesheets" value={rows.length} />
        <Stat
          label="Closed"
          value={rows.filter((row) => CLOSED.has(row.status)).length}
          tone="success"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
          <ClipboardCheck className="mx-auto size-8 text-ink-400" aria-hidden />
          <h2 className="mt-4 text-base font-semibold text-ink-900">No timesheets yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
            Once an intern accepts an offer and starts work, they can submit timesheets here for your approval.
          </p>
          {internCount > 0 ? (
            <p className="mt-3 rounded-full bg-ink-100 px-4 py-1 text-xs font-medium text-ink-600 inline-block">
              {internCount} intern{internCount === 1 ? "" : "s"} on your account — none have submitted yet
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/employer/timesheets/${encodeURIComponent(row.id)}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {row.candidate?.fullName ?? "Intern"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-subtle">
                    {formatPeriod(row.periodStart, row.periodEnd)}
                  </p>
                  {row.internNote ? (
                    <p className="mt-1.5 line-clamp-1 text-xs text-ink-500">&ldquo;{row.internNote}&rdquo;</p>
                  ) : null}
                </div>

                <p className="text-xs tabular-nums text-text-subtle">
                  {row.loggedDays} day{row.loggedDays === 1 ? "" : "s"} logged
                </p>

                <StatusPill status={row.status} />

                <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
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
    <div className="rounded-xl border border-ink-100 bg-white p-5">
      <p className="text-sm text-text-subtle">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${valueTone}`}>{value}</p>
    </div>
  );
}
