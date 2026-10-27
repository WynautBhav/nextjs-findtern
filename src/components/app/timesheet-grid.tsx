"use client";

/**
 * The timesheet editor.
 *
 * One row per day of the period. Each day gets one of the four legacy
 * statuses (Present / Absent / Fixed off / Holiday, INW-05) as large tap
 * targets, and a Present day that has happened can carry hours and a line
 * on what was done. On a phone the row stacks (day, then the four
 * statuses, then hours and note); on a wide screen it is one line.
 *
 * Rules, all legacy (INW-06 / INW-24): the sheet goes for approval once
 * every day has a status. Hours are optional and the period does not have
 * to be over, so days ahead can be marked too (a planned holiday, the
 * weekend). Hours and notes stay with days that have happened.
 *
 * Autosave: every change is written after a short pause and the indicator
 * says which of saving / saved / not saved is true. Sending always saves
 * first, so what the manager gets is exactly what is on screen, including
 * the weekend and holiday presets the intern never touched.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CloudUpload, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { LEGACY_DAY_STATUSES, editableDayStatus, unfilledDays, type LegacyDayStatus } from "@/lib/employer-timesheets";
import { defaultDayStatus, holidayName } from "@/lib/holidays";
import { dayParts, periodDays, todayIst, weekdayOf } from "@/lib/timesheet-days";
import { Pill, Surface } from "@/components/app/primitives";
import { dayTone } from "@/components/intern/day-status";
import { buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Entry = { date: string; hours: number; note: string; status: string };

type DayState = { date: string; status: LegacyDayStatus | ""; hours: number; note: string; wasLeave: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_DAILY = 12;

export function TimesheetGrid({
  timesheetId,
  periodStart,
  periodEnd,
  initialEntries,
  status,
  managerNote,
  internNote,
  backHref,
}: {
  timesheetId: string;
  periodStart: string | null;
  periodEnd: string | null;
  initialEntries: Entry[];
  status: string;
  managerNote: string | null;
  internNote: string | null;
  /** Where to go after the sheet is sent or deleted. */
  backHref: string;
}) {
  const router = useRouter();
  const todayIso = useMemo(() => todayIst(), []);
  const dates = useMemo(() => periodDays(periodStart, periodEnd), [periodStart, periodEnd]);

  const [days, setDays] = useState<DayState[]>(() => initialDays(dates, initialEntries));
  const [note, setNote] = useState(internNote ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sendState, setSendState] = useState<"idle" | "sending" | "error">("idle");
  const [sendError, setSendError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);

  const missing = useMemo(() => unfilledDays(dates, days), [dates, days]);
  const marked = dates.length - missing.length;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of days) if (d.status) out[d.status] = (out[d.status] ?? 0) + 1;
    return out;
  }, [days]);
  const totalHours = useMemo(() => days.reduce((sum, d) => sum + (Number.isFinite(d.hours) ? d.hours : 0), 0), [days]);
  const sentBack = status === "rejected";

  function update(date: string, patch: Partial<DayState>) {
    dirty.current = true;
    setSaveState("saving");
    setDays((prev) => prev.map((d) => (d.date === date ? { ...d, ...patch, wasLeave: patch.status ? false : d.wasLeave } : d)));
  }

  /** Weekdays up to today with no status yet become Present; nothing else changes. */
  function markWorkdaysPresent() {
    dirty.current = true;
    setSaveState("saving");
    setDays((prev) =>
      prev.map((d) => (!d.status && d.date <= todayIso && !isWeekend(d.date) ? { ...d, status: "Present" } : d)),
    );
  }
  const canBulkMark = days.some((d) => !d.status && d.date <= todayIso && !isWeekend(d.date));

  // Debounced autosave: long enough that typing "7.5" is one request.
  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist();
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, note]);

  async function persist(): Promise<boolean> {
    const body = JSON.stringify({ entries: toEntries(days, todayIso), note });
    const request = csrfFetch(`/api/intern/timesheets/${timesheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((res) => res.ok)
      .catch(() => false);
    inFlight.current = request;
    const ok = await request;
    if (inFlight.current === request) inFlight.current = null;
    setSaveState(ok ? "saved" : "error");
    return ok;
  }

  async function send() {
    setSendState("sending");
    setSendError("");
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      if (inFlight.current) await inFlight.current;
      // Always save first: presets the intern never touched only exist on screen.
      if (!(await persist())) {
        setSendError("Your latest changes did not save, so nothing was sent.");
        setSendState("error");
        return;
      }
      const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}/submit`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSendError(json?.error || "That did not send.");
        setSendState("error");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setSendError("That did not send. Check your connection.");
      setSendState("error");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this timesheet? This cannot be undone.")) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setDeleteError(json?.error || "Could not delete this timesheet. Try again.");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setDeleteError("Could not delete this timesheet. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  const firstMissing = missing[0] ?? null;
  const pct = dates.length ? Math.round((marked / dates.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {managerNote ? (
        <Surface className="border-accent-300/70 bg-accent-100/40 p-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-accent-700">
            {sentBack ? "Sent back by your manager" : "Your manager's note from last time"}
          </p>
          <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-ink-800">{managerNote}</p>
          <p className="mt-2 text-sm text-ink-600">Fix what they asked for, then send it again.</p>
        </Surface>
      ) : null}

      {/* ── Progress ─────────────────────────────────────────────── */}
      <Surface className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-600">Days marked</p>
            <p className="nums mt-1 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-900">
              {marked}
              <span className="ml-1 text-base font-normal text-ink-600">of {dates.length}</span>
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-label="Days marked"
          aria-valuemin={0}
          aria-valuemax={dates.length}
          aria-valuenow={marked}
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Days by status">
          {LEGACY_DAY_STATUSES.map((s) => (
            <li key={s}>
              <Pill tone={dayTone(s)}>
                {s} <span className="nums">{counts[s] ?? 0}</span>
              </Pill>
            </li>
          ))}
          {missing.length > 0 ? (
            <li>
              <Pill tone="waiting">
                Not marked <span className="nums">{missing.length}</span>
              </Pill>
            </li>
          ) : null}
        </ul>
        {canBulkMark ? (
          <button type="button" onClick={markWorkdaysPresent} className={buttonClass({ variant: "outline", size: "sm", className: "mt-5 h-auto min-h-11 whitespace-normal py-2 text-left" })}>
            Mark blank weekdays up to today as Present
          </button>
        ) : null}
      </Surface>

      {/* ── Days ─────────────────────────────────────────────────── */}
      <Surface as="section" aria-label="Days of this period" className="overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {days.map((day) => {
            const parts = dayParts(day.date);
            const holiday = holidayName(day.date);
            const isToday = day.date === todayIso;
            const future = day.date > todayIso;
            const label = `${parts.weekday} ${parts.date}`;
            return (
              <li
                key={day.date}
                id={`day-${day.date}`}
                className={cn(
                  "scroll-mt-24 px-4 py-4 sm:px-5 lg:grid lg:grid-cols-[8.5rem_minmax(0,25rem)_minmax(0,1fr)] lg:items-center lg:gap-5",
                  isWeekend(day.date) && "bg-ink-50/60",
                  isToday && "bg-brand-50/60",
                )}
              >
                <div className="flex items-baseline justify-between gap-3 lg:block">
                  <p className="text-sm font-semibold text-ink-900">
                    {parts.weekday} <span className="nums font-normal text-ink-700">{parts.date}</span>
                  </p>
                  <p className="text-xs text-ink-600">
                    {[isToday ? "Today" : holiday ?? (future ? "Upcoming" : isWeekend(day.date) ? "Weekend" : ""), day.wasLeave ? "was Leave, now Absent" : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div role="group" aria-label={`Status for ${label}`} className="mt-2.5 grid grid-cols-4 gap-1.5 lg:mt-0">
                  {LEGACY_DAY_STATUSES.map((s) => {
                    const on = day.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(day.date, { status: s })}
                        className={cn(
                          "apple-spring min-h-11 rounded-apple-sm border px-1 text-sm font-medium leading-tight",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1",
                          on
                            ? "border-brand-700 bg-brand-700 text-white shadow-xs"
                            : "border-ink-200/80 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {day.status === "Present" && !future ? (
                  <div className="mt-2.5 flex gap-2 lg:mt-0">
                    <label className="sr-only" htmlFor={`h-${day.date}`}>
                      Hours on {label} (optional)
                    </label>
                    <div className="relative w-24 shrink-0">
                      <input
                        id={`h-${day.date}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_DAILY}
                        step={0.5}
                        value={day.hours === 0 ? "" : day.hours}
                        placeholder="Hours"
                        onChange={(e) => update(day.date, { hours: clampHours(e.target.value) })}
                        className="apple-spring nums h-11 w-full rounded-apple-sm border border-ink-200/80 bg-white pl-3 pr-7 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-600">
                        h
                      </span>
                    </div>
                    <label className="sr-only" htmlFor={`n-${day.date}`}>
                      What you worked on, {label} (optional)
                    </label>
                    <input
                      id={`n-${day.date}`}
                      type="text"
                      maxLength={400}
                      value={day.note}
                      placeholder="What you did (optional)"
                      onChange={(e) => update(day.date, { note: e.target.value })}
                      className="apple-spring h-11 min-w-0 flex-1 rounded-apple-sm border border-ink-200/80 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                ) : (
                  <div className="hidden lg:block" />
                )}
              </li>
            );
          })}
        </ul>
      </Surface>

      {/* ── Note and send ────────────────────────────────────────── */}
      <Surface className="p-5 sm:p-6">
        <label htmlFor={`note-${timesheetId}`} className="block text-sm font-medium text-ink-800">
          Anything your manager should know
        </label>
        <p className="mt-0.5 text-sm text-ink-600">Optional. Useful if this period does not fit the normal pattern.</p>
        <Textarea
          id={`note-${timesheetId}`}
          value={note}
          rows={3}
          maxLength={2000}
          placeholder="For example: the design handoff arrived late, so two of these days went on catching up."
          onChange={(e) => {
            dirty.current = true;
            setSaveState("saving");
            setNote(e.target.value);
          }}
          className="mt-2 min-h-24"
        />

        <div className="mt-6 flex flex-col-reverse gap-4 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Legacy rule: a draft can be deleted; a sheet sent back stays on record. */}
          {status === "draft" ? (
            <button
              type="button"
              disabled={deleting}
              onClick={remove}
              className={buttonClass({ variant: "ghost", size: "md", className: "text-danger hover:bg-danger-soft" })}
            >
              {deleting ? "Deleting…" : "Delete this timesheet"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {missing.length > 0 ? (
              <p className="text-sm text-ink-600">
                <span className="nums font-semibold text-ink-900">{missing.length}</span> day{missing.length === 1 ? "" : "s"} still need
                {missing.length === 1 ? "s" : ""} a status.{" "}
                {firstMissing ? (
                  <a href={`#day-${firstMissing}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    Go to the first one
                  </a>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-ink-600">
                Every day is marked{totalHours > 0 ? <>, <span className="nums font-semibold text-ink-900">{totalHours}</span> hours logged</> : null}.
              </p>
            )}
            <button
              type="button"
              onClick={send}
              disabled={sendState === "sending" || missing.length > 0}
              className={buttonClass({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}
            >
              {sendState === "sending" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CloudUpload className="size-4" aria-hidden />}
              {sentBack ? "Send again for approval" : "Send for approval"}
            </button>
          </div>
        </div>

        {sendState === "error" ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {sendError} Press send again when you are ready.
          </p>
        ) : null}
        {deleteError ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {deleteError}
          </p>
        ) : null}
      </Surface>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-600" aria-live="polite">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success" aria-live="polite">
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger" aria-live="assertive">
        <AlertCircle className="size-4" aria-hidden />
        Not saved. Your changes are still here; the next edit retries.
      </span>
    );
  }
  return <span className="text-sm text-ink-600">Saves as you go</span>;
}

function isWeekend(iso: string): boolean {
  const w = weekdayOf(iso);
  return w === 0 || w === 6;
}

function clampHours(raw: string): number {
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_DAILY, n)) : 0;
}

/**
 * The editor's starting state: every day of the period, the saved status
 * read through `editableDayStatus` (a stored "Leave" shows as Absent), and
 * untouched days preset (weekends Fixed off, gazetted holidays Holiday).
 */
function initialDays(dates: string[], saved: Entry[]): DayState[] {
  const byDate = new Map(saved.map((e) => [e.date.slice(0, 10), e]));
  return dates.map((date) => {
    const e = byDate.get(date);
    const stored = editableDayStatus(e?.status);
    const wasLeave = typeof e?.status === "string" && e.status.trim().toLowerCase() === "leave";
    return {
      date,
      status: stored || defaultDayStatus(date),
      hours: typeof e?.hours === "number" ? e.hours : 0,
      note: typeof e?.note === "string" ? e.note : "",
      wasLeave,
    };
  });
}

/** What is saved: hours and notes only on Present days that have happened. */
function toEntries(days: DayState[], todayIso: string): Entry[] {
  return days.map((d) => {
    const keep = d.status === "Present" && d.date <= todayIso;
    return { date: d.date, status: d.status, hours: keep ? d.hours : 0, note: keep ? d.note.slice(0, 400) : "" };
  });
}
