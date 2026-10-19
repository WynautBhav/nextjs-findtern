"use client";

/**
 * Logging hours.
 *
 * There was no hour entry UI at all. The timesheet page could display drafts
 * that something else had created and could submit them, which is a report,
 * not a timesheet. A candidate doing twenty hours a week had nowhere to
 * record the twenty hours.
 *
 * ── Shape of the interaction ───────────────────────────────────────────
 *
 * A month grid, one cell per weekday, hours typed straight in. The grid is
 * chosen over a form of one row per entry because the work being described is
 * a month of days, and a month is a grid. It also makes a gap visible at a
 * glance, which a list cannot: you can see the Wednesday you did not work
 * without counting rows.
 *
 * ── Autosave, and why it is not a lie ───────────────────────────────────
 *
 * Every change is written immediately and the indicator says which of three
 * things is true: saving, saved, or could not save. A timesheet tool that
 * says "Saved" and then silently fails is worse than one with no autosave,
 * because the candidate has stopped looking. The failure state is explicit and
 * it tells them their work is still on the device and offers a retry.
 *
 * Nothing here is a draft the candidate has to remember to submit. Save is
 * automatic; submit is a separate deliberate act, because submitting is what
 * starts the clock on their manager's review.
 *
 * ── Motion ──────────────────────────────────────────────────────────────
 *
 * The total counts up when it changes, and the submit button is the only
 * thing on the page that moves on its own. Neither is decoration: the first
 * tells them the entry landed, the second tells them the review has started.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CloudUpload, Loader2, Minus, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { csrfFetch } from "@/lib/client-fetch";
import { DAY_STATUSES } from "@/lib/employer-timesheets";
import { defaultDayStatus, holidayName } from "@/lib/holidays";
import { periodDays, todayIst, weekdayOf } from "@/lib/timesheet-days";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

export type Entry = { date: string; hours: number; note: string; status: string };

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
  expectedHours,
}: {
  timesheetId: string;
  periodStart: string | null;
  periodEnd: string | null;
  initialEntries: Entry[];
  status: string;
  managerNote: string | null;
  internNote: string | null;
  expectedHours: number | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // A sheet the manager sent back can be fixed and resent.
  const readOnly = status !== "draft" && status !== "rejected";
  // Today in India, the same clock the API uses for "no future days".
  const todayIso = useMemo(() => todayIst(), []);
  const [entries, setEntries] = useState<Entry[]>(() =>
    withDayDefaults(buildDays(periodStart, periodEnd), initialEntries, todayIso),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [note, setNote] = useState(internNote ?? "");
  const [submitState, setSubmitState] = useState<SaveState>("idle");
  const [submitError, setSubmitError] = useState("");
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const days = useMemo(() => buildDays(periodStart, periodEnd), [periodStart, periodEnd]);

  // A sheet goes for approval once its last day has arrived; before then the
  // remaining days cannot be claimed, so it could never be complete.
  const lastDay = days[days.length - 1]?.date ?? null;
  const periodOpen = lastDay !== null && lastDay > todayIso;
  const lastDayLabel = lastDay
    ? new Date(`${lastDay}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" })
    : "";
  const todayInPeriod = days.some((d) => d.date === todayIso);
  const todayEntry = entries.find((e) => e.date === todayIso);
  const todayHours = todayEntry?.hours ?? 0;
  const todayLabel = new Date(`${todayIso}T12:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  function bumpToday(delta: number) {
    const next = Math.max(0, Math.min(MAX_DAILY, Math.round((todayHours + delta) * 2) / 2));
    setSaveState("saving");
    setHours(todayIso, String(next));
  }

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + (Number.isFinite(e.hours) ? e.hours : 0), 0),
    [entries],
  );

  const knownStatuses = useMemo(() => new Set<string>(DAY_STATUSES), []);
  /** Days still without a status - sending is blocked until this is zero. */
  const missingStatus = useMemo(
    () =>
      days.filter((day) => !knownStatuses.has(entries.find((e) => e.date === day.date)?.status ?? ""))
        .length,
    [days, entries, knownStatuses],
  );

  const getEntry = (date: string) => entries.find((e) => e.date === date);

  function setHours(date: string, raw: string) {
    const value = raw === "" ? 0 : Math.max(0, Math.min(MAX_DAILY, Number(raw) || 0));
    setEntries((prev) => {
      const found = prev.find((e) => e.date === date);
      if (!value && !found) return [...prev, { date, hours: value, note: "", status: defaultDayStatus(date) }];
      if (!found) return [...prev, { date, hours: value, note: "", status: defaultDayStatus(date) }];
      return prev.map((e) => (e.date === date ? { ...e, hours: value } : e));
    });
  }

  function setDayNote(date: string, text: string) {
    setEntries((prev) => {
      const found = prev.find((e) => e.date === date);
      if (!found) return [...prev, { date, hours: 0, note: text, status: defaultDayStatus(date) }];
      return prev.map((e) => (e.date === date ? { ...e, note: text } : e));
    });
  }

  function setDayStatus(date: string, dayStatus: string) {
    setSaveState("saving");
    setEntries((prev) => {
      const found = prev.find((e) => e.date === date);
      if (!found) return [...prev, { date, hours: 0, note: "", status: dayStatus }];
      return prev.map((e) => (e.date === date ? { ...e, status: dayStatus } : e));
    });
  }

  // Debounced autosave. Long enough that typing "8" does not fire three
  // requests, short enough that someone who closes the tab immediately after
  // their last edit still has it.
  useEffect(() => {
    if (readOnly) return;
    if (saveState === "idle") return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist();
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, note, readOnly, timesheetId]);

  async function persist(): Promise<boolean> {
    const request = csrfFetch(`/api/intern/timesheets/${timesheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, note }),
    })
      .then((res) => res.ok)
      .catch(() => false);
    inFlight.current = request;
    const ok = await request;
    if (inFlight.current === request) inFlight.current = null;
    setSaveState(ok ? "saved" : "error");
    return ok;
  }

  async function submit() {
    setSubmitState("saving");
    setSubmitError("");
    try {
      // Send exactly what is on screen: flush the pending autosave first.
      const pendingEdit = timer.current !== null || saveState === "saving" || saveState === "error";
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (inFlight.current) await inFlight.current;
      if (pendingEdit && !(await persist())) {
        setSubmitError("Your latest changes did not save, so nothing was sent.");
        setSubmitState("error");
        return;
      }
      const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(json?.error || "That did not send.");
        setSubmitState("error");
        setSaveState("error");
        return;
      }
      setSubmitState("saved");
      router.refresh();
    } catch {
      setSubmitError("That did not send.");
      setSubmitState("error");
    }
  }

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            {readOnly ? "Hours for this period" : "Log your hours"}
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {readOnly
              ? "These hours have already been sent, so they are read only."
              : "Every change saves on its own. Mon–Fri are working days - weekends start as Fixed off and gazetted holidays come pre-marked. Pick a status for every day before sending."}
          </p>
        </div>
        <SaveIndicator state={saveState} readOnly={readOnly} />
      </div>

      {/* ── Today ────────────────────────────────────────────────────
          The daily entry point. Same entries state and autosave as the month
          rows below, so logging today never touches a second code path. */}
      {!readOnly && todayInPeriod ? (
        <div className="border-b border-ink-100 bg-brand-50/40 px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.02em] text-brand-700">
                Today · {todayLabel}
              </p>
              <p className="mt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums text-ink-900">
                {todayHours > 0 ? `${todayHours}h logged` : "Log today's hours"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bumpToday(-0.5)}
                disabled={todayHours <= 0}
                aria-label="Log half an hour less for today"
                className="apple-spring apple-pressable grid size-11 place-items-center rounded-[10px] border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => bumpToday(0.5)}
                disabled={todayHours >= MAX_DAILY}
                aria-label="Log half an hour more for today"
                className="apple-spring apple-pressable grid size-11 place-items-center rounded-[10px] border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor={`n-today-${timesheetId}`}>
            What you worked on today
          </label>
          <input
            id={`n-today-${timesheetId}`}
            type="text"
            value={todayEntry?.note ?? ""}
            placeholder="What did you work on today?"
            onChange={(e) => {
              setSaveState("saving");
              setDayNote(todayIso, e.target.value);
            }}
            className="apple-spring mt-3 h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
      ) : null}

      {managerNote ? (
        <div className="border-b border-ink-100 bg-accent-100/40 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-700">
            From your manager
          </p>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-800">{managerNote}</p>
        </div>
      ) : null}

      {/* ── The grid ─────────────────────────────────────────────── */}
      <ul className="divide-y divide-ink-100">
        {days.map((day) => {
          const entry = getEntry(day.date);
          const hours = entry?.hours ?? 0;
          const dayStatus = entry?.status ?? "";
          const govtHoliday = holidayName(day.date);
          const isWeekend = day.weekend;
          const future = day.date > todayIso;
          const locked = readOnly || future;
          return (
            <li key={day.date} className={cn("px-5 py-3", isWeekend && "bg-ink-50/60")}>
              <div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[4rem_6rem_8rem_minmax(0,1fr)] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{day.weekday}</p>
                  <p className="text-xs tabular-nums text-ink-500">{day.label}</p>
                  {govtHoliday ? (
                    <p className="mt-0.5 text-2xs font-medium text-sky-700">{govtHoliday}</p>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <label className="sr-only" htmlFor={`h-${day.date}`}>
                    Hours on {day.weekday} {day.label}
                  </label>
                  <div className="relative">
                    <input
                      id={`h-${day.date}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_DAILY}
                      step={0.5}
                      disabled={locked}
                      value={hours === 0 ? "" : hours}
                      placeholder="0"
                      onChange={(e) => {
                        setSaveState("saving");
                        setHours(day.date, e.target.value);
                      }}
                      className={cn(
                        "apple-spring h-11 w-full rounded-[10px] border bg-white pr-8 pl-3 text-sm tabular-nums text-ink-900",
                        "placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
                        locked && "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-600",
                      )}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-400">
                      h
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="sr-only" htmlFor={`s-${day.date}`}>
                    Day status for {day.weekday} {day.label}
                  </label>
                  <select
                    id={`s-${day.date}`}
                    disabled={locked}
                    value={dayStatus}
                    onChange={(e) => setDayStatus(day.date, e.target.value)}
                    className={cn(
                      "apple-spring h-11 w-full rounded-[10px] border bg-white px-2 text-xs font-medium text-ink-900",
                      "focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
                      !dayStatus && "text-ink-400",
                      locked && "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-600",
                    )}
                  >
                    <option value="">Status…</option>
                    {DAY_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3 min-w-0 sm:col-span-1">
                  <label className="sr-only" htmlFor={`n-${day.date}`}>
                    What you worked on for {day.weekday} {day.label}
                  </label>
                  <input
                    id={`n-${day.date}`}
                    type="text"
                    disabled={locked}
                    value={entry?.note ?? ""}
                    placeholder={future ? "Not yet" : isWeekend ? "Weekend" : "What did you work on"}
                    onChange={(e) => {
                      setSaveState("saving");
                      setDayNote(day.date, e.target.value);
                    }}
                    className={cn(
                      "apple-spring h-11 w-full rounded-[10px] border bg-white px-3 text-sm text-ink-900",
                      "placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
                      locked && "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-600",
                    )}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Total ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-ink-50/60 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <motion.span
            key={Math.round(total * 2)}
            initial={reduce ? false : { opacity: 0.4, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-semibold tabular-nums tracking-[-0.02em] text-ink-900"
          >
            {total}
          </motion.span>
          <span className="text-sm text-ink-600">hours logged</span>
          {expectedHours ? (
            <span className="text-sm text-ink-500">of about {expectedHours}</span>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:w-auto">
            {status === "draft" ? (
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm("Delete this draft timesheet?")) return;
                  setDeleting(true);
                  setDeleteError("");
                  try {
                    const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}`, { method: "DELETE" });
                    if (res.ok) {
                      router.refresh();
                    } else {
                      const json = (await res.json().catch(() => null)) as { error?: string } | null;
                      setDeleteError(json?.error || "Could not delete this draft. Try again.");
                    }
                  } catch {
                    setDeleteError("Could not delete this draft. Check your connection and try again.");
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-55"
              >
                {deleting ? "Deleting…" : "Delete draft"}
              </button>
            ) : null}
            {periodOpen ? (
              <span className="basis-full text-right text-xs font-medium text-ink-500 sm:basis-auto">
                You can send this from {lastDayLabel}
              </span>
            ) : missingStatus > 0 ? (
              <span className="basis-full text-right text-xs font-medium text-amber-700 sm:basis-auto">
                {missingStatus} day{missingStatus === 1 ? "" : "s"} still need{missingStatus === 1 ? "s" : ""} a status
              </span>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={submitState === "saving" || total === 0 || missingStatus > 0 || periodOpen}
              title={
                periodOpen
                  ? `This period runs to ${lastDayLabel}`
                  : missingStatus > 0
                    ? "Pick a status for every day first"
                    : undefined
              }
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-55"
            >
              {submitState === "saving" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : submitState === "saved" ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <CloudUpload className="size-4" aria-hidden />
              )}
              {submitState === "saved" ? "Sent for approval" : "Send for approval"}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Note and submit ─────────────────────────────────────── */}
      {readOnly && status === "draft" ? null : (
        <div className="border-t border-ink-100 px-5 py-4">
          <label htmlFor={`note-${timesheetId}`} className="block text-sm font-medium text-ink-800">
            Anything your manager should know
          </label>
          <p className="mt-0.5 text-sm text-ink-500">
            Optional. Useful if something in this period does not fit the normal pattern.
          </p>
          <Textarea
            id={`note-${timesheetId}`}
            value={note}
            disabled={readOnly}
            rows={3}
            placeholder="For example: the design handoff arrived late, so two of these days went on catching up."
            onChange={(e) => {
              setSaveState("saving");
              setNote(e.target.value);
            }}
            className="mt-2 min-h-24"
          />
        </div>
      )}

      {deleteError ? (
        <p role="alert" className="flex items-start gap-2 border-t border-ink-100 bg-danger-soft px-5 py-3 text-sm text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {deleteError}
        </p>
      ) : null}

      {submitState === "error" ? (
        <p role="alert" className="flex items-start gap-2 border-t border-ink-100 bg-danger-soft px-5 py-3 text-sm text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {submitError || "That did not send."} Press send again when you are ready.
        </p>
      ) : null}
    </Surface>
  );
}

function SaveIndicator({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500">
        <Check className="size-4 text-brand-600" strokeWidth={2.5} aria-hidden />
        Sent
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-500" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <motion.span
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
        aria-live="polite"
      >
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
        Saved
      </motion.span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger" aria-live="assertive">
        <AlertCircle className="size-4" aria-hidden />
        Not saved, retrying
      </span>
    );
  }
  return <span className="text-sm text-ink-400">Autosaves</span>;
}

type Day = { date: string; weekday: string; label: string; weekend: boolean };

/**
 * Prefills statuses for days the intern never touched: gazetted holidays and
 * weekends get their default, weekdays stay blank to fill in. Runs once for
 * the initial state - it never overwrites a saved status, and nothing is
 * persisted until the next edit or submit.
 */
function withDayDefaults(days: Day[], saved: Entry[], todayIso: string): Entry[] {
  const byDate = new Map(saved.map((e) => [e.date, e]));
  return days.map((day) => {
    const existing = byDate.get(day.date);
    if (existing) {
      return { ...existing, status: existing.status ?? "" };
    }
    // Future days stay blank: the API refuses a status on a day not yet lived.
    const preset = day.date > todayIso ? "" : defaultDayStatus(day.date);
    if (!preset) return { date: day.date, hours: 0, note: "", status: "" };
    return { date: day.date, hours: 0, note: "", status: preset };
  });
}

/**
 * Every day between two dates, inclusive, as calendar days (UTC date math on
 * the stored bounds - see timesheet-days.ts for why local time added a day).
 *
 * Weekends are rendered too, dimmed. A grid with holes where the weekend is
 * hides the most common reason a month looks short, which is that someone
 * simply did not work Saturday, and that is not a gap worth feeling bad about.
 */
function buildDays(startIso: string | null, endIso: string | null): Day[] {
  return periodDays(startIso, endIso).map((date) => {
    const weekdayIndex = weekdayOf(date);
    const noonUtc = new Date(`${date}T12:00:00Z`);
    return {
      date,
      weekday: noonUtc.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      label: String(noonUtc.getUTCDate()),
      weekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}
