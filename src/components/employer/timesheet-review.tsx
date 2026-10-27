"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { DAY_CODE, EMPLOYER_DAY_STATUSES, weeklyTallies, type DayDetail } from "@/lib/employer-timesheets";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Cell colour per status, through the status tokens (no ad-hoc hues). */
const CELL: Record<string, string> = {
  Present: "border-success/25 bg-success-soft text-success",
  Absent: "border-danger/25 bg-danger-soft text-danger",
  "Fixed off": "border-ink-200 bg-ink-100 text-ink-600",
  Holiday: "border-accent-300/70 bg-accent-100 text-accent-700",
  Leave: "border-info/25 bg-info-soft text-info",
};

function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

/**
 * The review grid (DESIGN.md §7.3): the period as Monday-to-Sunday weeks,
 * one cell per day with its status code (P/A/F/H) and hours, and each week's
 * tally beside it. While the sheet isn't approved the employer can adjust
 * days (legacy allowed it on any unapproved sheet, EMH-45); the intern is
 * told once a day.
 */
export function TimesheetReview({
  timesheetId,
  days,
  editable,
}: {
  timesheetId: string;
  days: DayDetail[];
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(days.map((d) => [d.date, d.status])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(
    () => days.map((d) => ({ ...d, status: values[d.date] ?? d.status, hours: (values[d.date] ?? d.status) === "Present" ? d.hours || 8 : 0 })),
    [days, values],
  );
  const weeks = useMemo(() => weeklyTallies(shown), [shown]);
  const changed = days.filter((d) => values[d.date] && values[d.date] !== d.status);
  const notes = days.filter((d) => d.note);
  const usedCodes = Array.from(new Set(shown.map((d) => d.status).filter(Boolean)));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await csrfFetch(`/api/timesheets/${encodeURIComponent(timesheetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: changed.map((d) => ({ date: d.date, status: values[d.date] })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Couldn't save. Nothing changed." });
        return;
      }
      setMessage({ ok: true, text: "Saved. The intern has been told." });
      setEditing(false);
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "You appear to be offline. Nothing was saved." });
    } finally {
      setBusy(false);
    }
  }

  if (days.length === 0) {
    return <p className="text-sm text-ink-600">This timesheet has no period recorded, so there is nothing to lay out.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-600" aria-label="Key">
          {(usedCodes.length ? usedCodes : ["Present"]).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={cn("grid size-5 place-items-center rounded-apple-sm border text-2xs font-bold", CELL[s] ?? "border-ink-200 bg-white text-ink-700")} aria-hidden>
                {DAY_CODE[s] ?? "?"}
              </span>
              {s}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="size-5 rounded-apple-sm border border-dashed border-ink-300 bg-white" aria-hidden />
            Not filled
          </li>
        </ul>
        {editable && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
            <Pencil className="size-4" aria-hidden />
            Adjust days
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {weeks.map((w) => {
          // Pad the week to Monday-Sunday so columns line up across weeks.
          const cells: (DayDetail | null)[] = Array.from({ length: 7 }, (_, i) => {
            const t = new Date(`${w.weekOf}T00:00:00Z`);
            t.setUTCDate(t.getUTCDate() + i);
            const iso = t.toISOString().slice(0, 10);
            return w.days.find((d) => d.date === iso) ?? null;
          });
          return (
            <div key={w.weekOf} className="grid gap-3 rounded-apple-lg border border-ink-200/80 p-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:p-4">
              <ol className="grid grid-cols-7 gap-1.5" aria-label={`Week of ${dayLabel(w.weekOf, { day: "numeric", month: "short" })}`}>
                {cells.map((d, i) =>
                  d ? (
                    <li key={d.date} className="min-w-0">
                      <span className="block truncate text-center text-2xs font-medium uppercase tracking-wide text-ink-500">
                        <span className="sm:hidden">{WEEKDAYS[i][0]}</span>
                        <span className="hidden sm:inline">{WEEKDAYS[i]}</span> <span className="nums">{dayLabel(d.date, { day: "numeric" })}</span>
                      </span>
                      {editing ? (
                        <select
                          aria-label={`Status for ${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long" })}`}
                          value={values[d.date] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [d.date]: e.target.value }))}
                          className={cn(
                            "mt-1 h-11 w-full appearance-none rounded-apple-sm border text-center text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
                            CELL[values[d.date] ?? ""] ?? "border-dashed border-ink-300 bg-white text-ink-500",
                            values[d.date] !== d.status && "ring-2 ring-accent-400",
                          )}
                        >
                          {!values[d.date] ? <option value="">–</option> : null}
                          {d.status && !(EMPLOYER_DAY_STATUSES as readonly string[]).includes(d.status) ? (
                            <option value={d.status}>{DAY_CODE[d.status] ?? d.status}</option>
                          ) : null}
                          {EMPLOYER_DAY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {DAY_CODE[s]} · {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          title={`${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long" })}: ${d.status || "not filled"}${d.status === "Present" ? `, ${d.hours} h` : ""}${d.note ? ` (${d.note})` : ""}`}
                          className={cn(
                            "mt-1 flex h-11 flex-col items-center justify-center rounded-apple-sm border text-sm font-bold leading-none",
                            CELL[d.status] ?? "border-dashed border-ink-300 bg-white text-ink-400",
                          )}
                        >
                          {d.status ? (DAY_CODE[d.status] ?? "?") : "–"}
                          {d.status === "Present" && d.hours !== 8 ? <span className="nums mt-0.5 text-2xs font-medium">{d.hours}h</span> : null}
                          <span className="sr-only">{d.status || "Not filled"}</span>
                        </span>
                      )}
                    </li>
                  ) : (
                    <li key={i} aria-hidden className="min-w-0">
                      <span className="block text-center text-2xs font-medium uppercase tracking-wide text-ink-300">
                        <span className="sm:hidden">{WEEKDAYS[i][0]}</span>
                        <span className="hidden sm:inline">{WEEKDAYS[i]}</span>
                      </span>
                      <span className="mt-1 block h-11 rounded-apple-sm bg-ink-50" />
                    </li>
                  ),
                )}
              </ol>
              <dl className="nums flex items-baseline justify-between gap-3 border-t border-ink-100 pt-2 text-sm sm:block sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <div className="flex items-baseline gap-1.5 sm:justify-between">
                  <dt className="text-ink-600">Present</dt>
                  <dd className="font-semibold text-ink-900">{w.present}</dd>
                </div>
                <div className="flex items-baseline gap-1.5 sm:mt-1 sm:justify-between">
                  <dt className="text-ink-600">Hours</dt>
                  <dd className="font-semibold text-ink-900">{w.hours}</dd>
                </div>
                {w.unclaimed ? (
                  <div className="flex items-baseline gap-1.5 sm:mt-1 sm:justify-between">
                    <dt className="text-ink-600">Not filled</dt>
                    <dd className="font-semibold text-accent-700">{w.unclaimed}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          );
        })}
      </div>

      {editing ? (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-apple-lg border border-ink-200/80 bg-white p-3 shadow-sm">
          <button type="button" disabled={busy || changed.length === 0} onClick={save} className={buttonClass({ size: "sm" })}>
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes yet"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValues(Object.fromEntries(days.map((d) => [d.date, d.status])));
              setEditing(false);
            }}
            disabled={busy}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            Cancel
          </button>
          <span className="text-sm text-ink-600">The intern is told about the change.</span>
        </div>
      ) : null}
      {message ? (
        <p role="status" className={cn("mt-3 text-sm", message.ok ? "text-brand-700" : "text-danger")}>
          {message.text}
        </p>
      ) : null}

      {notes.length > 0 ? (
        <details className="group mt-6" open={notes.length <= 5}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
            Day notes from the intern <span className="nums font-normal text-ink-500">({notes.length})</span>
            <span aria-hidden className="text-ink-400 transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
          </summary>
          <ul className="mt-1 divide-y divide-ink-100 rounded-apple-lg border border-ink-200/80">
            {notes.map((d) => (
              <li key={d.date} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
                <span className="nums text-ink-600">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="text-ink-800 [overflow-wrap:anywhere]">{d.note}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
