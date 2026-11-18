import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TimesheetDecision } from "@/components/employer/decision-button";
import { TimesheetReview } from "@/components/employer/timesheet-review";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { canAccess } from "@/lib/security/guards";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { dayDetails, formatDay, formatPeriod, unfilledDays } from "@/lib/employer-timesheets";
import { periodDays } from "@/lib/timesheet-days";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { DetailRow } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Timesheet",
  robots: { index: false, follow: false },
};

/**
 * One timesheet, for review: the screen employers use most (DESIGN.md §7.3).
 *
 * The month as a day grid with the week's tally beside each row, the totals
 * up top, and the decision in the side column with an optional note on
 * approve. Ownership is `canAccess(session, timesheet.employerId)`; someone
 * else's sheet is a 404. Decisions go through PATCH /api/timesheets/[id]/
 * decision; day adjustments (any unapproved sheet, as legacy) through PATCH
 * /api/timesheets/[id].
 */
export default async function EmployerTimesheetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("employer");

  let timesheet: typeof schema.timesheets.$inferSelect | undefined;
  try {
    const [row] = await getDb().select().from(schema.timesheets).where(eq(schema.timesheets.id, id)).limit(1);
    timesheet = row;
  } catch (err) {
    console.error("[employer/timesheet] load failed", err);
    throw new Error("Couldn't load this timesheet. Try again in a moment.");
  }
  if (!timesheet || !session || !canAccess(session, timesheet.employerId)) notFound();

  let name = "Intern";
  let projectName: string | null = null;
  let down: { id: string; reason: string | null } | null = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({ firstName: schema.users.firstName, lastName: schema.users.lastName, projectName: schema.projects.projectName, projectId: schema.projects.id, takenDownAt: schema.projects.takenDownAt, takenDownReason: schema.projects.takenDownReason })
      .from(schema.timesheets)
      .innerJoin(schema.users, eq(schema.timesheets.internId, schema.users.id))
      .leftJoin(schema.proposals, eq(schema.timesheets.proposalId, schema.proposals.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.timesheets.id, timesheet.id))
      .limit(1);
    if (row) {
      const first = (row.firstName ?? "").trim();
      const last = (row.lastName ?? "").trim();
      const ini = initialsOf(first, last);
      projectName = row.projectName ?? null;
      down = row.takenDownAt && row.projectId ? { id: row.projectId, reason: row.takenDownReason } : null;
      const unlocked = (await hiredInternIds(db, timesheet.employerId)).has(timesheet.internId);
      name = !unlocked && ini !== "?" ? `Candidate ${ini}` : displayNameOf({ id: timesheet.internId, fullName: `${first} ${last}`.trim() || "Intern", initials: ini }, unlocked);
    }
  } catch (err) {
    console.error("[employer/timesheet] names", err);
  }

  const days = dayDetails(timesheet.entries, timesheet.periodStart, timesheet.periodEnd);
  const count = (s: string) => days.filter((d) => d.status === s).length;
  const present = count("Present");
  const absent = count("Absent");
  const off = count("Fixed off") + count("Holiday") + count("Leave");
  // The decision route's own rule, so Approve is never enabled for a sheet it would refuse.
  const unfilled = unfilledDays(periodDays(timesheet.periodStart, timesheet.periodEnd), timesheet.entries).length;
  const hours = days.reduce((n, d) => n + d.hours, 0);
  const status = timesheet.status;
  const decided = status === "approved" || status === "rejected";

  const periodText = formatPeriod(timesheet.periodStart, timesheet.periodEnd);

  return (
    <div>
      {down ? (
        <div className="mb-5">
          <TakedownBanner projects={[{ id: down.id, name: projectName ?? "This project", reason: down.reason }]} />
        </div>
      ) : null}
      <Link
        href="/employer/timesheets"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All timesheets
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{name}</h1>
          <p className="nums mt-1 text-base text-ink-700">
            {periodText}
            {projectName ? ` · ${projectName}` : ""}
          </p>
        </div>
        <StatusPill status={status} />
      </header>

      <Overview
        className="mt-8"
        lead={
          <LeadStat
            label="Hours worked"
            value={
              <>
                <RollingNumber value={hours} />
                <span className="ml-1.5 font-sans text-lg font-medium tracking-normal text-ink-700">h</span>
              </>
            }
            note={`${present} day${present === 1 ? "" : "s"} present out of ${days.length}. Interns are paid on approved hours only.`}
            tone={status === "approved" ? "brand" : "ink"}
          />
        }
        rest={
          <StatList
            items={[
              { label: "Days present", value: present },
              ...(absent > 0 ? [{ label: "Absent", value: absent }] : []),
              ...(off > 0 ? [{ label: "Fixed off or holiday", value: off }] : []),
              ...(unfilled > 0 ? [{ label: "Days not filled", value: <span className="text-[#9a4a08]">{unfilled}</span> }] : []),
            ]}
          />
        }
      />

      <div className="mt-10 grid gap-x-14 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Section
          className="xl:order-1"
          title="Days"
          hint={
            unfilled
              ? `${unfilled} day${unfilled === 1 ? " was" : "s were"} left empty. Worth asking about before you approve.`
              : `${days.length} days, every one filled.`
          }
        >
          <TimesheetReview timesheetId={timesheet.id} days={days} editable={status !== "approved" && !down} />
        </Section>

        <aside className="min-w-0 space-y-8 xl:order-2 xl:sticky xl:top-24 xl:self-start">
          <Section title="Decision">
            {down ? (
              <p className="text-sm leading-relaxed text-ink-700">
                Taken down by Findtern: view only. This timesheet cannot be approved or sent back while the project is taken down. Use Contact admin above.
              </p>
            ) : status === "submitted" ? (
              <>
                <p className="mb-4 text-sm leading-relaxed text-ink-700">
                  Approving covers <span className="nums font-semibold text-ink-900">{hours} hours</span> over <span className="nums font-semibold text-ink-900">{present} days</span> and locks them for billing. Sending back locks nothing: the intern corrects the days and sends it again.
                </p>
                <TimesheetDecision timesheetId={timesheet.id} unfilled={unfilled} />
              </>
            ) : decided ? (
              <p className="text-sm leading-relaxed text-ink-700">
                {status === "approved"
                  ? `Approved on ${formatDay(timesheet.approvedAt)}. These days are locked for billing.`
                  : `Sent back on ${formatDay(timesheet.rejectedAt)}. The intern corrects it and sends it again.`}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-700">
                Still with the intern. There is nothing to approve until they send it; you can adjust days meanwhile.
              </p>
            )}
            {timesheet.managerNote ? (
              <div className="mt-4 border-t border-ink-200 pt-3">
                <p className="text-sm font-medium text-ink-900">Your note</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{timesheet.managerNote}</p>
              </div>
            ) : null}
          </Section>

          {timesheet.internNote ? (
            <Section title="From the intern">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{timesheet.internNote}</p>
            </Section>
          ) : null}

          <section aria-label="Record">
            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              <DetailRow label="Sent" value={formatDay(timesheet.submittedAt)} mono />
              <DetailRow label="Approved" value={formatDay(timesheet.approvedAt)} mono />
              {timesheet.rejectedAt ? <DetailRow label="Sent back" value={formatDay(timesheet.rejectedAt)} mono /> : null}
            </dl>
            <a
              href={`/api/timesheets/${encodeURIComponent(timesheet.id)}/export`}
              download
              className={buttonClass({ variant: "outline", size: "sm", block: true, className: "mt-3 min-h-11" })}
            >
              <Download className="size-4" aria-hidden />
              Export to Excel
            </a>
            <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200 text-sm font-medium">
              {[
                [`${name}'s profile`, `/employer/intern/${encodeURIComponent(timesheet.internId)}`],
                ["The offer this bills against", `/employer/proposal/${encodeURIComponent(timesheet.proposalId)}`],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-11 items-center justify-between gap-2 text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
                    {label}
                    <ArrowUpRight className="size-4 text-ink-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
