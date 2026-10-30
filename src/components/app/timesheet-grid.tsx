"use client";

/**
 * The timesheet editor.
 *
 * One row per day of the period. Each day gets one of the four legacy
 * statuses (Present / Absent / Fixed off / Holiday, INW-05) as large tap
 * targets, and a column for what happened that day: hours and what was
 * done on a Present day, a remark on any other. On a phone the row stacks
 * (day, then the four statuses, then that column); on a wide screen it is
 * one line under column headings.
 *
 * Rules, all legacy (INW-06 / INW-24): the sheet goes for approval once
 * every day has a status. Hours are optional and the period does not have
 * to be over, so days ahead can be marked too (a planned holiday, the
 * weekend). Hours and notes stay with days that have happened; a day
 * ahead shows when its column opens.
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
import { Surface } from "@/components/app/primitives";
import { DAY_MARK, DayCalendar } from "@/components/app/tiles";
import { buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/app/use-confirm";

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
  const { ask: askConfirm, dialog } = useConfirm();
  const [deleteError, setDeleteError] = useState("");
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);
  // The body the pending timer would save, so a flush on leave sends the last edit.
  const pendingBody = useRef<string | null>(null);
  // Only the newest save may settle the indicator; an older one finishing late must not say "Saved".
  const seq = useRef(0);
  const [undo, setUndo] = useState<{ prev: DayState[]; count: number } | null>(null);

  const missing = useMemo(() => unfilledDays(dates, days), [dates, days]);
  const totalHours = useMemo(() => days.reduce((sum, d) => sum + (Number.isFinite(d.hours) ? d.hours : 0), 0), [days]);
  const sentBack = status === "rejected";

  function update(date: string, patch: Partial<DayState>) {
    dirty.current = true;
    setSaveState("saving");
    setUndo(null);
    setDays((prev) => prev.map((d) => (d.date === date ? { ...d, ...patch, wasLeave: patch.status ? false : d.wasLeave } : d)));
  }

  /** Weekdays up to today with no status yet become Present; nothing else changes. */
  function markWorkdaysPresent() {
    const blank = (d: DayState) => !d.status && d.date <= todayIso && !isWeekend(d.date);
    dirty.current = true;
    setSaveState("saving");
    setUndo({ prev: days, count: days.filter(blank).length });
    setDays(days.map((d) => (blank(d) ? { ...d, status: "Present" } : d)));
  }
  function undoMark() {
    if (!undo) return;
    dirty.current = true;
    setSaveState("saving");
    setDays(undo.prev);
    setUndo(null);
  }
  const canBulkMark = days.some((d) => !d.status && d.date <= todayIso && !isWeekend(d.date));

  // Debounced autosave: long enough that typing "7.5" is one request.
  useEffect(() => {
    if (!dirty.current) return;
    pendingBody.current = JSON.stringify({ entries: toEntries(days, todayIso), note });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist();
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, note]);

  // Leaving the page (route change, tab closed or hidden) must not drop the last edit: send it now,
  // with keepalive so the request outlives the page.
  useEffect(() => {
    const flush = () => {
      if (timer.current === null) return;
      window.clearTimeout(timer.current);
      timer.current = null;
      void persist(true);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(keepalive = false): Promise<boolean> {
    const body = pendingBody.current ?? JSON.stringify({ entries: toEntries(days, todayIso), note });
    const mine = ++seq.current;
    const request = csrfFetch(`/api/intern/timesheets/${timesheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive,
    })
      .then((res) => res.ok)
      .catch(() => false);
    inFlight.current = request;
    const ok = await request;
    if (inFlight.current === request) inFlight.current = null;
    // A newer save is on its way (or waiting on the timer): that one decides what the indicator says.
    if (mine === seq.current && timer.current === null) setSaveState(ok ? "saved" : "error");
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
    const ok = await askConfirm({ title: "Delete this timesheet?", body: "The sheet and its days are deleted. This can't be undone.", confirmLabel: "Yes, delete it" });
    if (!ok) return;
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
  const weeks = useMemo(() => byWeek(days), [days]);

  const sendBlock = (
    <div className="space-y-3">
      {missing.length > 0 ? (
        <p className="text-sm text-ink-600">
          Every day needs a status before it can go.{" "}
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
        className={buttonClass({ variant: "primary", size: "md", className: "w-full" })}
      >
        {sendState === "sending" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CloudUpload className="size-4" aria-hidden />}
        {sentBack ? "Send again for approval" : "Send for approval"}
      </button>
      {sendState === "error" ? (
        <p role="alert" className="flex items-start gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {sendError} Press send again when you are ready.
        </p>
      ) : null}
    </div>
  );

  return (
    // The month goes beside the days only when the editor itself is wide enough, not the screen: the app's sidebar takes its share first.
    <div className="@container">
      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_19rem] @6xl:grid-cols-[minmax(0,1fr)_21rem]">
        {dialog}
        {/* Screen readers hear where a save landed, never "Saving" on every keystroke. */}
        <p className="sr-only" aria-live="polite">
          {saveState === "saved" ? "All changes saved" : saveState === "error" ? "Not saved. Your changes are still on screen; the next edit retries." : ""}
        </p>

        {/* ── The month, beside the days: what is left, and the way out ── */}
        <aside className="min-w-0 @4xl:sticky @4xl:top-6 @4xl:col-start-2 @4xl:row-start-1">
          <Surface className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="nums text-4xl font-medium leading-none tracking-[-0.03em] text-ink-900">
                {missing.length}
                <span className="ml-1.5 text-base font-normal tracking-normal text-text-subtle">
                  day{missing.length === 1 ? "" : "s"} left to mark
                </span>
              </p>
            </div>
            <div className="mt-2">
              <SaveIndicator state={saveState} />
            </div>
            <div className="mt-5">
              <DayCalendar jump days={days.map((d) => ({ date: d.date, status: d.status }))} today={todayIso} />
            </div>
            {canBulkMark && !undo ? (
              <button
                type="button"
                onClick={markWorkdaysPresent}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-5 h-auto min-h-11 w-full whitespace-normal py-2" })}
              >
                Mark blank weekdays up to today as Present
              </button>
            ) : null}
            <div aria-live="polite" className={cn(undo && "mt-5 flex items-center justify-between gap-3 rounded-apple-md bg-brand-50 px-4 py-2")}>
              {undo ? (
                <>
                  <p className="text-sm text-ink-800">
                    <span className="nums font-semibold">{undo.count}</span> day{undo.count === 1 ? "" : "s"} marked Present.
                  </p>
                  <button type="button" onClick={undoMark} className={buttonClass({ variant: "ghost", size: "sm", className: "-mr-2" })}>
                    Undo
                  </button>
                </>
              ) : null}
            </div>
            <div className="mt-5 hidden @4xl:block">{sendBlock}</div>
          </Surface>
        </aside>

        <div className="min-w-0 space-y-4 @4xl:col-start-1 @4xl:row-start-1">
          {managerNote ? (
            <Surface className="bg-accent-100/50 p-5">
              <p className="text-sm font-semibold text-accent-800">
                {sentBack ? "Sent back by your manager" : "Your manager's note from last time"}
              </p>
              <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-ink-800">{managerNote}</p>
              <p className="mt-2 text-sm text-ink-600">Fix what they asked for, then send it again.</p>
            </Surface>
          ) : null}

          {/* ── Days, a week at a time ─────────────────────────────── */}
          {weeks.map((week) => {
            const weekMarked = week.filter((d) => d.status).length;
            const first = dayParts(week[0].date).date;
            const range = week.length === 1 ? first : `${first} – ${dayParts(week[week.length - 1].date).date}`;
            return (
              <Surface as="section" key={week[0].date} aria-label={`Week of ${range}`} className="@container overflow-hidden">
                <div className={cn(DAY_GRID, "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-2 pt-4 sm:px-5 @5xl:grid")}>
                  <h2 className="nums text-[0.9375rem] font-semibold text-ink-900">{range}</h2>
                  <p className="nums text-xs text-text-subtle">
                    {weekMarked} of {week.length} marked
                  </p>
                  <span aria-hidden className="hidden text-xs text-text-subtle @5xl:block">Hours</span>
                  <span aria-hidden className="hidden text-xs text-text-subtle @5xl:block">Work done or remark</span>
                </div>
                <ul className="divide-y divide-ink-100/80">
                  {week.map((day) => (
                    <DayRow key={day.date} day={day} todayIso={todayIso} update={update} />
                  ))}
                </ul>
              </Surface>
            );
          })}

          {/* ── Note, and the end of the sheet ──────────────────────── */}
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
            {/* Legacy rule: a draft can be deleted; a sheet sent back stays on record. */}
            {status === "draft" ? (
              <button
                type="button"
                disabled={deleting}
                onClick={remove}
                className={buttonClass({ variant: "ghost", size: "md", className: "mt-4 -ml-3 text-danger hover:bg-danger-soft" })}
              >
                {deleting ? "Deleting…" : "Delete this timesheet"}
              </button>
            ) : null}
            {deleteError ? (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {deleteError}
              </p>
            ) : null}
          </Surface>

          {/* Below the month's breakpoint the way out follows the days; on a phone it sticks above the tab bar. */}
          <div
            className={cn(
              "@4xl:hidden",
              "max-sm:sticky max-sm:bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] max-sm:z-30 max-sm:-mx-4 max-sm:border-t max-sm:border-ink-200 max-sm:bg-surface-raised max-sm:px-4 max-sm:py-3",
              "sm:rounded-apple-xl sm:border sm:border-ink-200/80 sm:bg-surface-raised sm:p-6",
            )}
          >
            <div className="mb-2 sm:hidden">
              <SaveIndicator state={saveState} />
            </div>
            {sendBlock}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One day. Its date wears the same mark as its cell in the month, so the
 * row and the calendar read as one thing; the status is one switch, not
 * four boxes. Hours and the remark open on the day itself.
 */
function DayRow({
  day,
  todayIso,
  update,
}: {
  day: DayState;
  todayIso: string;
  update: (date: string, patch: Partial<DayState>) => void;
}) {
  const parts = dayParts(day.date);
  const holiday = holidayName(day.date);
  const isToday = day.date === todayIso;
  const future = day.date > todayIso;
  const label = `${parts.weekday} ${parts.date}`;
  return (
    <li
      id={`day-${day.date}`}
      className={cn(
        DAY_GRID,
        "grid scroll-mt-24 items-center gap-x-5 gap-y-2 px-4 py-3.5 target:bg-brand-50 sm:px-5 @xl:grid-cols-[8.5rem_minmax(0,1fr)]",
        isWeekend(day.date) && "bg-ink-50/70",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "nums grid size-10 shrink-0 place-items-center rounded-apple-sm text-sm font-semibold transition-colors motion-reduce:transition-none",
            DAY_MARK[day.status]?.cell ?? DAY_MARK[""].cell,
            isToday && "ring-2 ring-ink-900 ring-offset-2",
          )}
        >
          {Number(day.date.slice(8, 10))}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-900">{parts.weekday}</p>
          <p className="truncate text-xs text-ink-600">
            {[isToday ? "Today" : holiday ?? "", day.wasLeave ? "was Leave, now Absent" : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div role="group" aria-label={`Status for ${label}`} className="grid grid-cols-4 gap-1 rounded-apple-md bg-ink-100/70 p-1">
        {LEGACY_DAY_STATUSES.map((s) => {
          const on = day.status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => update(day.date, { status: s })}
              className={cn(
                "apple-spring min-h-10 touch:min-h-11 rounded-[calc(var(--radius-apple-md)-4px)] px-1 text-sm leading-tight",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                on ? "bg-white font-semibold text-ink-900 shadow-xs" : "font-medium text-ink-600 hover:bg-white/60 hover:text-ink-900",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      {future ? (
        // The server takes hours and notes only for days that have happened.
        <div className="flex min-w-0 @xl:col-start-2 @5xl:col-start-4">
          <p className="flex h-11 w-full items-center rounded-apple-sm border border-dashed border-ink-200 px-3 text-sm text-text-subtle">
            Remark opens on {parts.date}
          </p>
        </div>
      ) : (
        // One line under the status when the column is narrow; its own two columns when wide.
        <div className="flex min-w-0 gap-2 @xl:col-start-2 @5xl:contents">
          {day.status === "Present" ? (
            <HoursField date={day.date} label={label} hours={day.hours} update={update} />
          ) : (
            <span aria-hidden className="hidden text-sm text-text-subtle @5xl:block">–</span>
          )}
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`n-${day.date}`}>
              {day.status === "Present" ? `What you worked on, ${label}` : `Remark for ${label}`} (optional)
            </label>
            <input
              id={`n-${day.date}`}
              type="text"
              maxLength={400}
              value={day.note}
              placeholder={day.status === "Present" ? "What you worked on (optional)" : "Remark (optional)"}
              onChange={(e) => update(day.date, { note: e.target.value })}
              className={cn(FIELD, "px-3")}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Hours as text with a decimal keypad, not type=number: a number field changes
 * under the mouse wheel while the page scrolls. The draft is kept as typed so
 * "7." survives; only a valid value reaches the sheet.
 */
function HoursField({
  date,
  label,
  hours,
  update,
}: {
  date: string;
  label: string;
  hours: number;
  update: (date: string, patch: Partial<DayState>) => void;
}) {
  const [draft, setDraft] = useState(hours === 0 ? "" : String(hours));
  const parsed = parseHours(draft);
  const invalid = parsed === null;
  const errId = `h-${date}-err`;
  return (
    <div className="w-24 shrink-0">
      <div className="relative">
        <label className="sr-only" htmlFor={`h-${date}`}>
          Hours on {label} (optional)
        </label>
        <input
          id={`h-${date}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          placeholder="Hours"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errId : undefined}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (!/^\d{0,2}(\.\d{0,2})?$/.test(v)) return;
            setDraft(v);
            const n = parseHours(v);
            if (n !== null && n !== hours) update(date, { hours: n });
          }}
          onBlur={() => {
            if (invalid) setDraft(hours === 0 ? "" : String(hours));
          }}
          className={cn(FIELD, "nums pl-3 pr-7", invalid && "border-danger focus:border-danger focus:ring-danger/20")}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-600">
          h
        </span>
      </div>
      {invalid ? (
        <p id={errId} className="mt-1 text-xs text-danger">
          0 to {MAX_DAILY}
        </p>
      ) : null}
    </div>
  );
}

/** "" is no hours; anything over a day's maximum is not a value (null). */
function parseHours(raw: string): number | null {
  if (raw === "" || raw === ".") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= MAX_DAILY ? n : null;
}

const FIELD =
  "apple-spring h-11 w-full rounded-apple-sm border border-ink-200/80 bg-white text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

/** Monday-first weeks, the same weeks as the month beside them. */
function byWeek(days: DayState[]): DayState[][] {
  const out: DayState[][] = [];
  for (const d of days) {
    if (out.length === 0 || weekdayOf(d.date) === 1) out.push([]);
    out[out.length - 1].push(d);
  }
  return out;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-600">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
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

/** What is saved: on days that have happened, a note on any day and hours on Present days. */
function toEntries(days: DayState[], todayIso: string): Entry[] {
  return days.map((d) => {
    const happened = d.date <= todayIso;
    return {
      date: d.date,
      status: d.status,
      hours: happened && d.status === "Present" ? d.hours : 0,
      note: happened ? d.note.slice(0, 400) : "",
    };
  });
}

/** Day · status · hours · work done on one line, once the week is wide enough (shared by its heading and its days). */
const DAY_GRID = "@5xl:grid-cols-[8.5rem_minmax(0,21rem)_6rem_minmax(0,1fr)] @5xl:gap-5";
