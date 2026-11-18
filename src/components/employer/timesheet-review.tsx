"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { KeepFocusClear } from "@/components/app/keep-focus-clear";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { DAY_CODE, EMPLOYER_DAY_STATUSES, weeklyTallies, type DayDetail } from "@/lib/employer-timesheets";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Cell colour per status, through the status tokens (no ad-hoc hues). */
const CELL: Record<string, string> = {
  Present: "border-transparent bg-brand-100 text-brand-900",
  Absent: "border-transparent bg-danger-soft text-danger",
  "Fixed off": "border-transparent bg-ink-200 text-ink-700",
  Holiday: "border-transparent bg-accent-100 text-accent-700",
  Leave: "border-transparent bg-info-soft text-info",
};

function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return shortDate(new Date(`${iso}T00:00:00Z`), { ...opts, timeZone: "UTC" });
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
  const grid = useRef<HTMLDivElement>(null);
  const adjust = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // The button pressed unmounts on both switches (Adjust days, Cancel/Save), so focus moves on with it.
  useEffect(() => {
    if (editing) grid.current?.querySelector("select")?.focus();
    else if (wasEditing.current) adjust.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

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
              <span className={cn("grid size-5 place-items-center rounded-md border text-xs font-semibold", CELL[s] ?? "border-ink-300 bg-surface-raised text-ink-700")} aria-hidden>
                {s === "Present" ? "8" : (DAY_CODE[s] ?? s.charAt(0).toUpperCase())}
              </span>
              {s === "Present" ? "Present, hours worked" : s}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="size-5 rounded-md border border-dashed border-ink-400" aria-hidden />
            Not filled
          </li>
        </ul>
        {editable && !editing ? (
          <button ref={adjust} type="button" onClick={() => setEditing(true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
            <Pencil className="size-4" aria-hidden />
            Adjust days
          </button>
        ) : null}
      </div>

      <div ref={grid} className="mt-5">
        <div aria-hidden className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-6">
          <span className="max-sm:hidden" />
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-ink-600 sm:gap-2">
            {WEEKDAYS.map((w) => (
              <span key={w}>
                <span className="sm:hidden">{w[0]}</span>
                <span className="max-sm:hidden">{w}</span>
              </span>
            ))}
          </div>
        </div>
        {weeks.map((w) => {
          // Pad the week to Monday-Sunday so columns line up across weeks.
          const cells: (DayDetail | null)[] = Array.from({ length: 7 }, (_, i) => {
            const t = new Date(`${w.weekOf}T00:00:00Z`);
            t.setUTCDate(t.getUTCDate() + i);
            const iso = t.toISOString().slice(0, 10);
            return w.days.find((d) => d.date === iso) ?? null;
          });
          const weekName = `Week of ${dayLabel(w.weekOf, { day: "numeric", month: "short" })}`;
          return (
            <div key={w.weekOf} className="grid gap-3 border-t border-ink-300 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-6">
              <div className="flex items-baseline justify-between gap-3 sm:block">
                <p className="text-sm text-ink-700">
                  Week of <span className="nums font-medium text-ink-900">{dayLabel(w.weekOf, { day: "numeric", month: "short" })}</span>
                </p>
                <p className="nums sm:mt-1">
                  <span className="font-display text-2xl font-semibold leading-none text-ink-900">{w.hours}</span>
                  <span className="ml-1 text-sm text-ink-700">h</span>
                </p>
                {w.unclaimed ? <p className="text-sm font-semibold text-ink-900 sm:mt-1">{w.unclaimed} not filled</p> : null}
              </div>
              <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label={weekName}>
                {cells.map((d, i) =>
                  d ? (
                    <li key={d.date} className="min-w-0">
                      {editing ? (
                        <select
                          aria-label={`Status for ${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long" })}`}
                          value={values[d.date] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [d.date]: e.target.value }))}
                          className={cn(
                            "h-16 w-full appearance-none rounded-md border text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-700 md:text-sm",
                            CELL[values[d.date] ?? ""] ?? "border-dashed border-ink-400 bg-surface-raised text-ink-700",
                            values[d.date] !== d.status && "ring-2 ring-signal",
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
                            "relative flex h-16 flex-col items-center justify-center rounded-md border text-sm font-semibold leading-none",
                            CELL[d.status] ?? "border-dashed border-ink-400 bg-surface-raised text-ink-700",
                          )}
                        >
                          <span className="nums absolute left-1.5 top-1 text-xs font-normal opacity-80">{dayLabel(d.date, { day: "numeric" })}</span>
                          {d.status === "Present" ? (
                            <span className="nums font-display text-lg">{d.hours}</span>
                          ) : (
                            <span>{d.status ? (DAY_CODE[d.status] ?? d.status.charAt(0).toUpperCase()) : "–"}</span>
                          )}
                          <span className="sr-only">{d.status ? `${d.status}${d.status === "Present" ? `, ${d.hours} hours` : ""}` : "Not filled"}</span>
                        </span>
                      )}
                    </li>
                  ) : (
                    <li key={i} aria-hidden className="min-w-0">
                      <span className="block h-16 rounded-md bg-ink-200/40" />
                    </li>
                  ),
                )}
              </ol>
            </div>
          );
        })}
        <div className="border-t border-ink-300" />
      </div>

      {editing ? (
        <div id="timesheet-save-bar" className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-ink-300 bg-surface-raised p-3 shadow-[var(--shadow-float)] transition-[opacity,translate] duration-[var(--motion-base)] starting:translate-y-2 starting:opacity-0 lg:bottom-4">
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
          <KeepFocusClear of="timesheet-save-bar" />
        </div>
      ) : null}
      {/* Always mounted, so the result is announced when it fills in. */}
      <p role="status" className={message ? cn("mt-3 text-sm", message.ok ? "text-brand-700" : "text-danger") : "sr-only"}>
        {message?.text}
      </p>

      {notes.length > 0 ? (
        <details className="group mt-6" open={notes.length <= 5}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
            Day notes from the intern <span className="nums font-normal text-ink-600">({notes.length})</span>
            <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
          </summary>
          <ul className="mt-1 divide-y divide-ink-200 border-y border-ink-200">
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
