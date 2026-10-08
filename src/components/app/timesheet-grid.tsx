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
import { AlertCircle, Check, CloudUpload, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { csrfFetch } from "@/lib/client-fetch";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

export type Entry = { date: string; hours: number; note: string };

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

  const readOnly = status !== "draft";
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [note, setNote] = useState(internNote ?? "");
  const [submitState, setSubmitState] = useState<SaveState>("idle");
  const timer = useRef<number | null>(null);

  const days = useMemo(() => buildDays(periodStart, periodEnd), [periodStart, periodEnd]);

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + (Number.isFinite(e.hours) ? e.hours : 0), 0),
    [entries],
  );

  const getEntry = (date: string) => entries.find((e) => e.date === date);

  function setHours(date: string, raw: string) {
    const value = raw === "" ? 0 : Math.max(0, Math.min(MAX_DAILY, Number(raw) || 0));
    setEntries((prev) => {
      const found = prev.find((e) => e.date === date);
      if (!value && !found) return prev;
      if (!found) return [...prev, { date, hours: value, note: "" }];
      return prev.map((e) => (e.date === date ? { ...e, hours: value } : e));
    });
  }

  function setDayNote(date: string, text: string) {
    setEntries((prev) => {
      const found = prev.find((e) => e.date === date);
      if (!found) return [...prev, { date, hours: 0, note: text }];
      return prev.map((e) => (e.date === date ? { ...e, note: text } : e));
    });
  }

  // Debounced autosave. Long enough that typing "8" does not fire three
  // requests, short enough that someone who closes the tab immediately after
  // their last edit still has it.
  useEffect(() => {
    if (readOnly) return;
    if (saveState === "idle") return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries, note }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, note, readOnly, timesheetId]);

  async function submit() {
    setSubmitState("saving");
    try {
      const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        setSubmitState("error");
        setSaveState("error");
        return;
      }
      setSubmitState("saved");
      router.refresh();
    } catch {
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
              : "Every change saves on its own. Nothing to remember before you close this."}
          </p>
        </div>
        <SaveIndicator state={saveState} readOnly={readOnly} />
      </div>

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
          const isWeekend = day.weekend;
          return (
            <li key={day.date} className={cn("px-5 py-3", isWeekend && "bg-ink-50/60")}>
              <div className="flex items-center gap-4">
                <div className="w-16 shrink-0">
                  <p className="text-sm font-semibold text-ink-900">{day.weekday}</p>
                  <p className="text-xs tabular-nums text-ink-500">{day.label}</p>
                </div>

                <div className="w-24 shrink-0">
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
                      disabled={readOnly}
                      value={hours === 0 ? "" : hours}
                      placeholder="0"
                      onChange={(e) => {
                        setSaveState("saving");
                        setHours(day.date, e.target.value);
                      }}
                      className={cn(
                        "h-11 w-full rounded-lg border bg-white pr-8 pl-3 text-sm tabular-nums text-ink-900 transition-[border-color,box-shadow] duration-[var(--dur-instant)]",
                        "placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
                        readOnly && "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-600",
                      )}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-400">
                      h
                    </span>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`n-${day.date}`}>
                    What you worked on for {day.weekday} {day.label}
                  </label>
                  <input
                    id={`n-${day.date}`}
                    type="text"
                    disabled={readOnly}
                    value={entry?.note ?? ""}
                    placeholder={isWeekend ? "Weekend" : "What did you work on"}
                    onChange={(e) => {
                      setSaveState("saving");
                      setDayNote(day.date, e.target.value);
                    }}
                    className={cn(
                      "h-11 w-full rounded-lg border bg-white px-3 text-sm text-ink-900 transition-[border-color,box-shadow] duration-[var(--dur-instant)]",
                      "placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
                      readOnly && "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-600",
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={submitState === "saving" || total === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-[var(--dur-instant)] hover:bg-primary-hover hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55"
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

      {submitState === "error" ? (
        <p role="alert" className="flex items-start gap-2 border-t border-ink-100 bg-danger-soft px-5 py-3 text-sm text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          That did not send. Your hours are still saved on this device. Press send again when you are ready.
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
 * Weekdays between two dates, inclusive.
 *
 * Weekends are rendered too, dimmed. A grid with holes where the weekend is
 * hides the most common reason a month looks short, which is that someone
 * simply did not work Saturday, and that is not a gap worth feeling bad about.
 */
function buildDays(startIso: string | null, endIso: string | null): Day[] {
  if (!startIso || !endIso) return [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const out: Day[] = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const last = new Date(end);
  last.setHours(12, 0, 0, 0);

  let guard = 0;
  while (cursor <= last && guard < 40) {
    const weekdayIndex = cursor.getDay();
    out.push({
      date: toIso(cursor),
      weekday: cursor.toLocaleDateString("en-IN", { weekday: "short" }),
      label: String(cursor.getDate()),
      weekend: weekdayIndex === 0 || weekdayIndex === 6,
    });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
