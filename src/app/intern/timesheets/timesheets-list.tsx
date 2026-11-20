import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";

import { NumberedSteps } from "@/components/app/numbered-steps";
import { PageHead, Pill, Surface } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { Tile } from "@/components/app/tiles";
import { buttonClass } from "@/components/ui/button";
import { HoursHeatmap, type HeatDay } from "@/components/intern/timesheets/hours-heatmap";
import { dayDetails, editableDayStatus, unfilledDays, type Period } from "@/lib/employer-timesheets";
import { shortDate } from "@/lib/format";
import { hoursIn, toArray, type TimesheetRow } from "@/lib/journey";
import { formatPeriodDays, periodDays } from "@/lib/timesheet-days";
import { cn } from "@/lib/utils";

import { DeleteSheetButton } from "./delete-sheet-button";

export type InternshipOption = { id: string; label: string };

/**
 * The Timesheets list for one hired internship, props only: the page loads the data and works out
 * the period rules, this lays them out.
 */
export function TimesheetsList({
  lede,
  options,
  selectedId,
  nextLine,
  createButton,
  sheets,
  periods,
  today,
}: {
  lede: string;
  /** Every hired internship, for the picker; shown only when there is more than one. */
  options: InternshipOption[];
  selectedId: string;
  nextLine: string;
  createButton: React.ReactNode;
  sheets: TimesheetRow[];
  periods: Period[];
  today: string;
}) {
  return (
    <div>
      <PageHead title="Timesheets" lede={lede} />

      {options.length > 1 ? (
        // Many placements share a role and a company, so each option carries its start date; a plain GET form works without script.
        <form method="get" className="mb-6 flex flex-wrap items-end gap-3 lg:mb-8">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="ts-internship" className="text-sm font-medium text-ink-800">
              Internship <span className="nums font-normal text-ink-600">({options.length})</span>
            </label>
            <select
              id="ts-internship"
              name="proposalId"
              defaultValue={selectedId}
              className="mt-1.5 h-11 w-full min-w-0 rounded-apple-sm border border-ink-200 bg-white px-3 text-base text-ink-900 outline-none hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 sm:text-sm"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass({ variant: "outline", size: "md", className: "h-11" })}>
            Show
          </button>
        </form>
      ) : null}

      {/* The real next action, before anything to read. */}
      <Surface
        as="section"
        data-first-content
        aria-label="Next timesheet"
        className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between lg:mb-8 lg:p-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <CalendarClock className="mt-1 size-5 shrink-0 text-brand-700" aria-hidden />
          <p className="text-pretty text-base font-medium leading-snug text-ink-900 sm:text-lg">{nextLine}</p>
        </div>
        {createButton ? <div className="shrink-0">{createButton}</div> : null}
      </Surface>

      {sheets.length > 0 ? (
        <SheetsOverview sheets={sheets} periods={periods} today={today} />
      ) : (
        // The next-timesheet line above already says when the first one opens; this is the how, once.
        <Tile title="How timesheets work">
          <NumberedSteps
            steps={[
              "Start a timesheet. Each one covers a month of your internship, counted from your joining date.",
              "Mark every day Present, Absent, Fixed off or Holiday. Weekends and public holidays come pre-marked.",
              "You can send it on the last day of the period, once every day is marked. Your manager approves it or sends it back with a note.",
              "Changed your mind? Withdraw a sheet that is still waiting, fix it, and send it again.",
            ]}
          />
        </Tile>
      )}
    </div>
  );
}

/**
 * The internship's days as a heatmap of hours, beside every sheet on a
 * rail from sent to approved. The heatmap answers "what have I logged";
 * the rail answers "where is each month".
 */
function SheetsOverview({ sheets, periods, today }: { sheets: TimesheetRow[]; periods: Period[]; today: string }) {
  const days = heatDays(sheets, periods);
  const logged = Number(days.reduce((n, d) => n + d.hours, 0).toFixed(1));
  const present = days.filter((d) => d.status === "Present" || d.hours > 0).length;
  const approved = Number(sheets.filter((t) => t.status === "approved").reduce((n, t) => n + hoursIn(t), 0).toFixed(1));

  return (
    <div className="grid items-start gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Tile
        title="Hours by day"
        description={
          <span className="nums">
            <span className="font-semibold text-ink-900">{logged} h</span> logged · {present} day{present === 1 ? "" : "s"} worked
            {approved > 0 ? <> · {approved} h approved</> : null}
          </span>
        }
      >
        <HoursHeatmap days={days} today={today} />
      </Tile>

      <Tile title="Every timesheet" description="Newest first">
        <ol className="relative space-y-6 before:absolute before:inset-y-2 before:left-[0.4375rem] before:w-px before:bg-ink-200">
          {sheets.map((sheet) => (
            <SheetStep key={sheet.id} sheet={sheet} />
          ))}
        </ol>
      </Tile>
    </div>
  );
}

const DOT: Record<string, string> = {
  approved: "bg-success",
  submitted: "bg-accent-500",
  rejected: "bg-info",
  draft: "bg-white ring-2 ring-inset ring-ink-400",
};

/** One sheet on the rail: its period, where it stands, the dates it moved, and its one action. */
function SheetStep({ sheet }: { sheet: TimesheetRow }) {
  const status = (sheet.status ?? "draft").toLowerCase();
  const editable = status === "draft" || status === "rejected";
  const days = periodDays(sheet.periodStart, sheet.periodEnd);
  const marked = days.length - unfilledDays(days, sheet.entries).length;
  const href = `/intern/timesheets?sheet=${encodeURIComponent(sheet.id)}`;
  const steps = [
    { label: "Started", at: sheet.createdAt },
    sheet.submittedAt ? { label: "Sent", at: sheet.submittedAt } : null,
    status === "approved" ? { label: "Approved", at: sheet.approvedAt } : null,
    status === "rejected" ? { label: "Sent back", at: sheet.rejectedAt } : null,
  ].filter((x): x is { label: string; at: Date | null } => x !== null);

  return (
    <li className="relative pl-8">
      <span aria-hidden className={cn("absolute left-0 top-1.5 size-3.5 rounded-full ring-4 ring-white", DOT[status] ?? DOT.draft)} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={href}
          className="nums inline-flex min-h-6 items-center rounded-apple-sm text-base font-medium text-ink-900 underline-offset-4 touch:min-h-11 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {formatPeriodDays(sheet.periodStart, sheet.periodEnd) || "A period"}
        </Link>
        <span className="nums text-sm font-medium text-ink-900">{Number(hoursIn(sheet).toFixed(1))} h</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
        {editable ? <span className="nums text-xs text-text-subtle">{marked} of {days.length} days marked</span> : null}
      </div>
      <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-600" aria-label="History">
        {steps.map((st, i) => (
          <li key={st.label} className="flex items-center gap-1.5">
            {i > 0 ? <ArrowRight aria-hidden className="size-3 text-text-subtle" /> : null}
            <span>
              {st.label} <span className="nums font-medium text-ink-800">{st.at ? dayMonth(st.at) : "–"}</span>
            </span>
          </li>
        ))}
      </ol>

      {editable && sheet.managerNote ? (
        <div className="mt-3 rounded-apple-sm bg-accent-50 px-4 py-3">
          <p className="text-xs font-semibold text-accent-700">From your manager</p>
          <p className="mt-1 whitespace-pre-wrap text-pretty text-sm text-ink-800">{sheet.managerNote}</p>
        </div>
      ) : null}

      {editable || status === "submitted" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editable ? (
            <Link href={href} className={buttonClass({ variant: status === "rejected" ? "accent" : "outline", size: "sm" })}>
              {status === "rejected" ? "Fix and resend" : marked === days.length ? "Check and send" : "Mark your days"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          {status === "draft" || status === "submitted" ? <DeleteSheetButton timesheetId={sheet.id} withdraw={status === "submitted"} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Every day of the internship (and of any sheet outside it), with what its sheet says. */
function heatDays(sheets: TimesheetRow[], periods: Period[]): HeatDay[] {
  const byDate = new Map<string, HeatDay>();
  for (const s of sheets) {
    const sheet = sheetLabel(s.status);
    // Hours follow the shared day rule (a Present day with none is 8 h), so this total agrees with every other.
    const hours = new Map(dayDetails(s.entries, s.periodStart, s.periodEnd).map((d) => [d.date, d.hours]));
    for (const date of periodDays(s.periodStart, s.periodEnd)) byDate.set(date, { date, hours: hours.get(date) ?? 0, status: "", sheet });
    for (const e of toArray<Record<string, unknown>>(s.entries)) {
      const d = e && typeof e.date === "string" ? byDate.get(e.date.slice(0, 10)) : undefined;
      if (!d) continue;
      d.status = editableDayStatus(e.status);
    }
  }
  const covered = [...byDate.keys()].sort();
  const bounds = [periods[0]?.start, periods.at(-1)?.end, covered[0], covered.at(-1)].filter((x): x is string => !!x).sort();
  if (bounds.length === 0) return [];
  return periodDays(bounds[0], bounds[bounds.length - 1]).map((date) => byDate.get(date) ?? { date, hours: 0, status: "", sheet: null });
}

function dayMonth(d: Date): string {
  return shortDate(d, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

