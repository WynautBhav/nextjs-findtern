import { Pill, Surface, WaitingNote } from "@/components/app/primitives";
import { dayTone } from "@/components/intern/day-status";
import { LEGACY_DAY_STATUSES } from "@/lib/employer-timesheets";
import { formatDayLabel } from "@/lib/format";
import { holidayName } from "@/lib/holidays";
import type { TimesheetRow } from "@/lib/journey";
import { dayParts, periodDays } from "@/lib/timesheet-days";
import { cn } from "@/lib/utils";

import { DeleteSheetButton } from "./delete-sheet-button";

type ViewDay = { date: string; status: string; hours: number; note: string; sentAs: string | null };

/**
 * A sheet that is with the manager or approved, read only (INW-08): every
 * day of the period with its status as it stands now, so the intern sees
 * what was sent and what the manager changed. Days the manager adjusted
 * are marked with what the intern had sent (`internStatus`, kept by the
 * submit route); a sheet sent before that existed simply shows no marks.
 */
export function SheetView({ sheet, backHref }: { sheet: TimesheetRow; backHref: string }) {
  const days = viewDays(sheet);
  const adjusted = days.filter((d) => d.sentAs !== null && d.sentAs !== d.status);
  const counts: Record<string, number> = {};
  for (const d of days) if (d.status) counts[d.status] = (counts[d.status] ?? 0) + 1;
  const extra = Object.keys(counts).filter((k) => !(LEGACY_DAY_STATUSES as readonly string[]).includes(k));
  const hours = days.reduce((sum, d) => sum + d.hours, 0);
  const status = (sheet.status ?? "").toLowerCase();

  return (
    <div className="space-y-6">
      <Surface className="p-5 sm:p-6">
        <div className="grid grid-cols-3 gap-4 sm:gap-5">
          <Figure label="Days present" value={counts.Present ?? 0} />
          <Figure
            label={status === "approved" ? "Approved" : "Sent"}
            text={formatDayLabel((status === "approved" ? sheet.approvedAt : sheet.submittedAt) ?? sheet.createdAt)}
          />
          {hours > 0 ? <Figure label="Hours logged" value={hours} /> : <Figure label="Days in period" value={days.length} />}
        </div>
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Days by status">
          {[...LEGACY_DAY_STATUSES, ...extra].map((s) => (
            <li key={s}>
              <Pill tone={dayTone(s)}>
                {s} <span className="nums">{counts[s] ?? 0}</span>
              </Pill>
            </li>
          ))}
        </ul>
        {status === "submitted" ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <WaitingNote who="Your manager" typical="Reviews usually take about two working days, and you are notified either way." />
            <DeleteSheetButton timesheetId={sheet.id} withdraw redirectTo={backHref} size="md" />
          </div>
        ) : null}
      </Surface>

      {adjusted.length > 0 ? (
        <Surface className="border-info/25 bg-info-soft/60 p-5">
          <p className="text-[0.9375rem] font-semibold text-ink-900">
            Your manager changed {adjusted.length} day{adjusted.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-ink-700">Each one is marked below with what you had sent.</p>
        </Surface>
      ) : null}

      <Surface as="section" aria-label="Days of this period" className="overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {days.map((d) => {
            const parts = dayParts(d.date);
            const changed = d.sentAs !== null && d.sentAs !== d.status;
            const holiday = holidayName(d.date);
            return (
              <li
                key={d.date}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 sm:px-5",
                  changed && "bg-info-soft/40",
                )}
              >
                <p className="w-28 shrink-0 text-sm font-semibold text-ink-900">
                  {parts.weekday} <span className="nums font-normal text-ink-700">{parts.date}</span>
                </p>
                <Pill tone={dayTone(d.status)}>{d.status || "Not marked"}</Pill>
                {changed ? (
                  <span className="text-sm text-info">Changed by your manager · you sent {d.sentAs || "no status"}</span>
                ) : holiday ? (
                  <span className="text-xs text-ink-600">{holiday}</span>
                ) : null}
                {d.hours > 0 || d.note ? (
                  <p className="basis-full text-sm text-ink-600 sm:basis-auto sm:flex-1 sm:text-right">
                    {d.hours > 0 ? <span className="nums font-medium text-ink-800">{d.hours} h</span> : null}
                    {d.hours > 0 && d.note ? " · " : null}
                    {d.note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Surface>

      {sheet.internNote || sheet.managerNote ? (
        <Surface className="divide-y divide-ink-100 px-5">
          {sheet.internNote ? <Note label="Your note" body={sheet.internNote} /> : null}
          {sheet.managerNote ? <Note label="Your manager's note" body={sheet.managerNote} /> : null}
        </Surface>
      ) : null}
    </div>
  );
}

function Figure({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-600">{label}</p>
      {text ? (
        <p className="mt-1.5 text-lg font-semibold text-ink-900">{text}</p>
      ) : (
        <p className="nums mt-1 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-900">{value}</p>
      )}
    </div>
  );
}

function Note({ label, body }: { label: string; body: string }) {
  return (
    <div className="py-4">
      <p className="text-sm font-medium text-ink-600">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-pretty text-[0.9375rem] leading-relaxed text-ink-800">{body}</p>
    </div>
  );
}

function viewDays(sheet: TimesheetRow): ViewDay[] {
  const byDate = new Map<string, Record<string, unknown>>();
  if (Array.isArray(sheet.entries)) {
    for (const e of sheet.entries) {
      if (!e || typeof e !== "object") continue;
      const r = e as Record<string, unknown>;
      if (typeof r.date === "string") byDate.set(r.date.slice(0, 10), r);
    }
  }
  const dates = sheet.periodStart && sheet.periodEnd ? periodDays(sheet.periodStart, sheet.periodEnd) : [...byDate.keys()].sort();
  return dates.map((date) => {
    const r = byDate.get(date);
    const status = typeof r?.status === "string" ? r.status.trim() : "";
    return {
      date,
      status,
      hours: typeof r?.hours === "number" && Number.isFinite(r.hours) ? r.hours : 0,
      note: typeof r?.note === "string" ? r.note.trim() : "",
      sentAs: typeof r?.internStatus === "string" ? r.internStatus.trim() : null,
    };
  });
}
