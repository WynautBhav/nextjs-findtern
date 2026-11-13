import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TimesheetDecision } from "@/components/employer/decision-button";
import { TimesheetReview } from "@/components/employer/timesheet-review";
import { canAccess } from "@/lib/security/guards";
import { Avatar } from "@/components/app/avatar";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { dayDetails, formatDay, formatPeriod, unfilledDays } from "@/lib/employer-timesheets";
import { periodDays } from "@/lib/timesheet-days";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { DetailRow, SectionHead, Surface } from "@/components/app/primitives";
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
  let initials = "I";
  let masked = true;
  let projectName: string | null = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({ firstName: schema.users.firstName, lastName: schema.users.lastName, projectName: schema.projects.projectName })
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
      initials = ini === "?" ? "I" : ini;
      projectName = row.projectName ?? null;
      const unlocked = (await hiredInternIds(db, timesheet.employerId)).has(timesheet.internId);
      masked = !unlocked;
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

  const totals: [string, number, string?][] = [
    ["Present", present],
    ["Hours", hours],
    ["Absent", absent],
    ["Off / holiday", off],
  ];

  return (
    <div>
      <Link
        href="/employer/timesheets"
        className="apple-spring mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All timesheets
      </Link>

      <HeroPanel className="p-0 sm:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6 sm:p-8">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar masked={masked} name={masked ? undefined : name} initials={initials} size="lg" />
            <div className="min-w-0">
              <h1 className="text-balance text-2xl font-medium tracking-[-0.02em] sm:text-3xl">{name}</h1>
              <p className="nums mt-1 text-sm text-on-dark-subtle">
                Timesheet for {formatPeriod(timesheet.periodStart, timesheet.periodEnd)}
                {projectName ? ` · ${projectName}` : ""}
              </p>
            </div>
          </div>
          <StatusPill status={status} />
        </div>
        <dl className="grid grid-cols-2 border-t border-white/15 bg-black/10 sm:grid-cols-4">
          {totals.map(([label, value], i) => (
            <div
              key={label}
              className={[
                "px-6 py-5 sm:px-8",
                i % 2 === 1 ? "border-l border-white/15" : "",
                i >= 2 ? "border-t border-white/15 sm:border-t-0" : "",
                i === 2 ? "sm:border-l" : "",
              ].join(" ")}
            >
              <dt className="text-[13px] text-on-dark-subtle">{label}</dt>
              <dd className="nums mt-1 text-3xl font-light tracking-[-0.03em]">{value}</dd>
            </div>
          ))}
        </dl>
      </HeroPanel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Surface as="section" className="min-w-0 p-5 sm:p-6">
          <SectionHead
            title="Days"
            hint={
              unfilled
                ? `${unfilled} day${unfilled === 1 ? " was" : "s were"} left empty. Worth asking about before you approve.`
                : `${days.length} days, every one filled.`
            }
          />
          <TimesheetReview timesheetId={timesheet.id} days={days} editable={status !== "approved"} />
        </Surface>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Surface as="section" className="p-5">
            <h2 className="text-base font-semibold text-ink-900">Decision</h2>
            <div className="mt-3">
              {status === "submitted" ? (
                <TimesheetDecision timesheetId={timesheet.id} unfilled={unfilled} />
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
            </div>
            {timesheet.managerNote ? (
              <div className="mt-4 rounded-apple-md bg-ink-50 px-4 py-3">
                <p className="text-sm font-medium text-text-subtle">Your note</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-800">{timesheet.managerNote}</p>
              </div>
            ) : null}
          </Surface>

          {timesheet.internNote ? (
            <Surface as="section" className="p-5">
              <h2 className="text-base font-semibold text-ink-900">From the intern</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{timesheet.internNote}</p>
            </Surface>
          ) : null}

          <Surface as="section" className="px-5 pb-2 pt-4">
            <dl className="divide-y divide-ink-100">
              <DetailRow label="Sent" value={formatDay(timesheet.submittedAt)} mono />
              <DetailRow label="Approved" value={formatDay(timesheet.approvedAt)} mono />
              {timesheet.rejectedAt ? <DetailRow label="Sent back" value={formatDay(timesheet.rejectedAt)} mono /> : null}
            </dl>
            <a
              href={`/api/timesheets/${encodeURIComponent(timesheet.id)}/export`}
              download
              className={buttonClass({ variant: "outline", size: "sm", block: true, className: "mb-3 mt-2" })}
            >
              <Download className="size-4" aria-hidden />
              Export to Excel
            </a>
          </Surface>

          <div className="grid gap-2">
            <Link
              href={`/employer/intern/${encodeURIComponent(timesheet.internId)}`}
              className="apple-spring flex min-h-11 items-center justify-between gap-2 rounded-apple-xl border border-dashed border-ink-200 px-5 py-3.5 text-sm font-medium text-ink-700 hover:border-brand-300 hover:bg-white"
            >
              {name}&apos;s profile
              <ArrowUpRight className="size-4 text-ink-500" aria-hidden />
            </Link>
            <Link
              href={`/employer/proposal/${encodeURIComponent(timesheet.proposalId)}`}
              className="apple-spring flex min-h-11 items-center justify-between gap-2 rounded-apple-xl border border-dashed border-ink-200 px-5 py-3.5 text-sm font-medium text-ink-700 hover:border-brand-300 hover:bg-white"
            >
              The offer this bills against
              <ArrowUpRight className="size-4 text-ink-500" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
