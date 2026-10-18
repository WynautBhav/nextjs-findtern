import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleSlash, FileText, StickyNote } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { DecisionButton } from "@/components/employer/decision-button";
import { TimesheetDayEditor } from "@/components/employer/timesheet-day-editor";
import { canAccess } from "@/lib/security/guards";
import { displayNameOf, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import {
  DAY_STATUSES,
  countClaimed,
  countStatuses,
  formatDay,
  normaliseEntries,
} from "@/lib/employer-timesheets";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Timesheet",
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<string, string> = {
  Present: "bg-success-soft text-success",
  Absent: "bg-danger-soft text-danger",
  "Fixed off": "bg-ink-100 text-ink-600",
  Holiday: "bg-accent-100 text-accent-700",
};

/**
 * One timesheet, for review.
 *
 * Ownership is `canAccess(session, timesheet.employerId)` - the employer who
 * owns the review, unlike the candidate page where the check is a cross-tenant
 * query because the viewer is not the subject.
 *
 * Approve and reject write through `PATCH /api/timesheets/[id]/decision`
 * (employer-owned, 409 once decided), which sets `approved_at` /
 * `rejected_at`, stores the rejection reason as the manager note, and pushes
 * the intern notification. A decision is final - decided sheets render the
 * outcome instead of the buttons.
 */

export default async function EmployerTimesheetDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("employer");

  let timesheet: typeof schema.timesheets.$inferSelect | undefined;
  let candidate: CandidateProfile | null = null;
  let projectName: string | null = null;
  let nameUnlocked = false;

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.timesheets)
      .where(eq(schema.timesheets.id, id))
      .limit(1);
    timesheet = row;
  } catch {
    // DB unavailable - fall through to notFound() rather than throwing.
  }

  if (!timesheet || !session || !canAccess(session, timesheet.employerId)) notFound();

  try {
    const db = getDb();
    // Selecting the whole `users` table (rather than a name and a hand-built
    // partial row) keeps the password column out of anything that renders.
    const [row] = await db
      .select({ user: schema.users, projectName: schema.projects.projectName })
      .from(schema.timesheets)
      .innerJoin(schema.users, eq(schema.timesheets.internId, schema.users.id))
      .leftJoin(schema.proposals, eq(schema.timesheets.proposalId, schema.proposals.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.timesheets.id, timesheet.id))
      .limit(1);

    if (row) {
      projectName = row.projectName ?? null;
      const [onboarding] = await db
        .select()
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, timesheet.internId))
        .limit(1);

      candidate = toCandidateProfile(row.user, onboarding);

      try {
        nameUnlocked = (await hiredInternIds(db, timesheet.employerId)).has(timesheet.internId);
      } catch {
        nameUnlocked = false;
      }
    }
  } catch {
    // Decoration only - the page reads fine without the names.
  }

  const entries = normaliseEntries(timesheet.entries, timesheet.periodStart, timesheet.periodEnd);
  const counts = countStatuses(entries);
  const claimed = countClaimed(entries);
  const decided = timesheet.status === "approved" || timesheet.status === "rejected";

  return (
    <div>
      <Link
        href="/employer/timesheets"
        className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All timesheets
      </Link>

      <PageHeader
        title={candidate ? displayNameOf(candidate, nameUnlocked) : "Timesheet"}
        subtitle={`${projectName ? `${projectName} · ` : ""}${formatDay(timesheet.periodStart)} – ${formatDay(timesheet.periodEnd)}`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <h2 className="text-sm font-semibold text-ink-900">Day log</h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-text-subtle">
                This timesheet has no period recorded, so there is nothing to lay out.
              </p>
            ) : (
              <>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {DAY_STATUSES.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
                    <li
                      key={status}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[status]}`}
                    >
                      {counts[status]} {status.toLowerCase()}
                    </li>
                  ))}
                  {claimed === 0 ? (
                    <li className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600">
                      Nothing claimed
                    </li>
                  ) : null}
                </ul>

                <TimesheetDayEditor
                  timesheetId={timesheet.id}
                  entries={entries}
                  editable={timesheet.status === "submitted"}
                />

                <p className="mt-4 text-xs tabular-nums leading-relaxed text-text-subtle">
                  {claimed} of {entries.length} day{entries.length === 1 ? "" : "s"} in the period
                  carry a status. A gap is not a rejection - it is a day the intern never
                  submitted, and it is worth asking about before approving.
                </p>
              </>
            )}
          </section>

          {timesheet.internNote || timesheet.managerNote ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <StickyNote className="size-4 text-ink-400" aria-hidden />
                Notes
              </h2>
              {timesheet.internNote ? (
                <div className="mt-4">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                    From the intern
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                    {timesheet.internNote}
                  </p>
                </div>
              ) : null}
              {timesheet.managerNote ? (
                <div className="mt-4 border-t border-ink-100 pt-4">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                    From the manager
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                    {timesheet.managerNote}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Status
            </p>
            <p className="mt-2">
              <StatusPill status={timesheet.status} />
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Stamp label="Submitted" value={timesheet.submittedAt} />
              <Stamp label="Approved" value={timesheet.approvedAt} />
              <Stamp label="Rejected" value={timesheet.rejectedAt} />
            </dl>
          </section>

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Decision
            </p>
            {decided ? (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                This timesheet was {timesheet.status} on{" "}
                {formatDay(timesheet.approvedAt ?? timesheet.rejectedAt)}. Decisions are final. If something
                needs correcting, contact support.
              </p>
            ) : timesheet.status === "draft" ? (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                Still a draft on the intern side. Nothing to review until it is submitted.
              </p>
            ) : (
              <>
                <div className="mt-3 grid gap-2">
                  <Decision
                    icon={<CheckCircle2 className="size-4" aria-hidden />}
                    label="Approve"
                    timesheetId={timesheet.id}
                  />
                  <Decision
                    icon={<CircleSlash className="size-4" aria-hidden />}
                    label="Reject with a reason"
                    timesheetId={timesheet.id}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-subtle">
                  Approving locks the hours for billing. Rejecting needs a reason - the intern
                  sees it and the period goes back to them.
                </p>
              </>
            )}
          </section>

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              <FileText className="size-3.5" aria-hidden />
              Context
            </p>
            {candidate ? (
              <Link
                href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                className="apple-spring mt-2.5 block min-h-11 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                {displayNameOf(candidate, nameUnlocked)}&apos;s profile
              </Link>
            ) : null}
            <p className="mt-2 text-xs leading-relaxed text-text-subtle">
              Against proposal{" "}
              <Link
                href={`/employer/proposal/${encodeURIComponent(timesheet.proposalId)}`}
                className="apple-spring font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                {timesheet.proposalId.slice(0, 8)}…
              </Link>
              . Billing runs off the approval, so this is the record that decides the invoice.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stamp({ label, value }: { label: string; value: Date | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-ink-900">{formatDay(value)}</dd>
    </div>
  );
}

function Decision({ icon, label, timesheetId }: { icon: React.ReactNode; label: string; timesheetId: string }) {
  return <DecisionButton icon={icon} label={label} timesheetId={timesheetId} />;
}
