import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleSlash, FileText, StickyNote } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DecisionButton } from "@/components/employer/decision-button";
import { canAccess } from "@/lib/security/guards";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
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
 * Ownership is `canAccess(session, timesheet.employerId)` — the employer who
 * owns the review, unlike the candidate page where the check is a cross-tenant
 * query because the viewer is not the subject.
 *
 * Approve and reject have no route. `POST /api/employer/timesheets/:id/approve`
 * would have to write `approved_at`, set `status`, and push a notification, and
 * none of those exist — so both controls are rendered disabled with the missing
 * endpoint named on them. A green "Approve" that silently fails is the exact
 * failure this build is trying not to introduce.
 */

export default async function EmployerTimesheetDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  let timesheet: typeof schema.timesheets.$inferSelect | undefined;
  let candidate: CandidateProfile | null = null;
  let projectName: string | null = null;

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.timesheets)
      .where(eq(schema.timesheets.id, id))
      .limit(1);
    timesheet = row;
  } catch {
    // DB unavailable — fall through to notFound() rather than throwing.
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
    }
  } catch {
    // Decoration only — the page reads fine without the names.
  }

  const entries = normaliseEntries(timesheet.entries, timesheet.periodStart, timesheet.periodEnd);
  const counts = countStatuses(entries);
  const claimed = countClaimed(entries);
  const decided = timesheet.status === "approved" || timesheet.status === "rejected";

  return (
    <div>
      <Link
        href="/employer/timesheets"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All timesheets
      </Link>

      <PageHeader
        title={candidate?.fullName ?? "Timesheet"}
        subtitle={`${projectName ? `${projectName} · ` : ""}${formatDay(timesheet.periodStart)} – ${formatDay(timesheet.periodEnd)}`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <section className="rounded-xl border border-ink-100 bg-white p-6">
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

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-left text-sm">
                    <caption className="sr-only">
                      Day-by-day attendance for {formatDay(timesheet.periodStart)} to{" "}
                      {formatDay(timesheet.periodEnd)}.
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="border-b border-ink-100 pb-2 pr-4 text-xs font-medium text-text-subtle"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="border-b border-ink-100 pb-2 text-xs font-medium text-text-subtle"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.date}>
                          <td className="border-b border-ink-100 py-2 pr-4 tabular-nums text-ink-700">
                            {new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            })}
                          </td>
                          <td className="border-b border-ink-100 py-2">
                            {entry.status ? (
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-2xs font-medium ${
                                  STATUS_TONE[entry.status] ?? "bg-ink-100 text-ink-600"
                                }`}
                              >
                                {entry.status}
                              </span>
                            ) : (
                              <span className="text-xs text-ink-300">Not claimed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-text-subtle">
                  {claimed} of {entries.length} day{entries.length === 1 ? "" : "s"} in the period
                  carry a status. A gap is not a rejection — it is a day the intern never
                  submitted, and it is worth asking about before approving.
                </p>
              </>
            )}
          </section>

          {timesheet.internNote || timesheet.managerNote ? (
            <section className="rounded-xl border border-ink-100 bg-white p-6">
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
          <section className="rounded-xl border border-ink-100 bg-white p-5">
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

          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Decision
            </p>
            {decided ? (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                This timesheet was {timesheet.status} on{" "}
                {formatDay(timesheet.approvedAt ?? timesheet.rejectedAt)}. A decision is final in
                this build — there is no route to reopen one.
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
                  />
                  <Decision
                    icon={<CircleSlash className="size-4" aria-hidden />}
                    label="Reject with a reason"
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-subtle">
                  Both are disabled on purpose. This build has no employer timesheet mutation
                  route, so neither can write{" "}
                  <code className="font-mono">status</code>,{" "}
                  <code className="font-mono">approved_at</code> or the notification that follows.
                </p>
              </>
            )}
          </section>

          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              <FileText className="size-3.5" aria-hidden />
              Context
            </p>
            {candidate ? (
              <Link
                href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                className="mt-2.5 block text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                {candidate.fullName}&apos;s profile
              </Link>
            ) : null}
            <p className="mt-2 text-xs leading-relaxed text-text-subtle">
              Against proposal{" "}
              <Link
                href={`/employer/proposal/${encodeURIComponent(timesheet.proposalId)}`}
                className="font-medium text-brand-700 underline-offset-4 hover:underline"
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
      <dd className="text-sm font-medium text-ink-900">{formatDay(value)}</dd>
    </div>
  );
}

function Decision({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <DecisionButton icon={icon} label={label} />;
}
