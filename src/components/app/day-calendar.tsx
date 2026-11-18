"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { clampMonth, isoOf, monthGrid, monthLabel, moveDay, weekdayLabel } from "./day-calendar-model";

/**
 * A month calendar for picking one day, where days a rule forbids stay visible but cannot be picked (the native
 * date control cannot grey out weekends). A grid with one tab stop: arrows move a day or a week, Home and End go to
 * the ends of the week, Page Up and Page Down to the neighbouring month, Enter or Space picks. Unavailable days stay
 * focusable (aria-disabled) so the arrows never skip them, and they say so to a screen reader. Weeks start on Monday;
 * days are India calendar days, "YYYY-MM-DD".
 */

const DAY_NAME = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (iso: string) => DAY_NAME.format(new Date(`${iso}T00:00:00Z`));

export function DayCalendar({
  selected,
  startDay,
  today,
  isDisabled,
  onPick,
  note,
}: {
  /** The picked day, or "". */
  selected: string;
  /** The day the keyboard starts on: the picked day, or the first open one. */
  startDay: string;
  /** Today in India; the month before it cannot be browsed to. */
  today: string;
  isDisabled: (iso: string) => boolean;
  onPick: (iso: string) => void;
  /** One quiet line under the grid that says why days are greyed out. */
  note?: string;
}) {
  const [cursor, setCursor] = useState(startDay);
  const grid = useRef<HTMLTableElement>(null);
  // Focus follows the cursor only after a key moved it, never on the first paint of a closed picker.
  const moved = useRef(true);
  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7));
  const weeks = monthGrid(year, month);
  const labelId = `cal-${year}-${month}`;

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [cursor]);

  const go = (days: number, months = 0) => {
    moved.current = true;
    setCursor((c) => moveDay(c, days, months));
  };
  const prev = clampMonth(year, month - 1);
  const canGoBack = isoOf(prev.year, prev.month, new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate()) >= today;

  function onKeyDown(e: React.KeyboardEvent) {
    const col = (new Date(`${cursor}T00:00:00Z`).getUTCDay() + 6) % 7;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go(-1),
      ArrowRight: () => go(1),
      ArrowUp: () => go(-7),
      ArrowDown: () => go(7),
      Home: () => go(-col),
      End: () => go(6 - col),
      PageUp: () => go(0, -1),
      PageDown: () => go(0, 1),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  }

  return (
    <div className="w-[19.5rem] max-w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            // Staying on the nav button keeps keyboard focus where the user is.
            setCursor((c) => moveDay(c, 0, -1));
          }}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="apple-spring grid size-11 place-items-center rounded-apple-sm text-ink-700 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <p id={labelId} aria-live="polite" className="text-sm font-semibold text-ink-900">
          {monthLabel(year, month)}
        </p>
        <button
          type="button"
          onClick={() => setCursor((c) => moveDay(c, 0, 1))}
          aria-label="Next month"
          className="apple-spring grid size-11 place-items-center rounded-apple-sm text-ink-700 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <table ref={grid} role="grid" aria-labelledby={labelId} onKeyDown={onKeyDown} className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, col) => (
              <th key={col} scope="col" abbr={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][col]} className="pb-1 text-center text-xs font-medium text-text-subtle">
                {weekdayLabel(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, col) => (
                <td key={col} role="gridcell" className="p-0 text-center">
                  {day ? (
                    <button
                      type="button"
                      tabIndex={day === cursor ? 0 : -1}
                      aria-label={`${dayName(day)}${isDisabled(day) ? ", unavailable" : ""}`}
                      aria-disabled={isDisabled(day) || undefined}
                      aria-pressed={day === selected}
                      onFocus={() => day !== cursor && setCursor(day)}
                      onClick={() => {
                        if (!isDisabled(day)) onPick(day);
                      }}
                      className={cn(
                        "nums mx-auto grid size-11 place-items-center rounded-apple-sm text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1",
                        day === selected
                          ? "bg-brand-700 font-semibold text-white"
                          : isDisabled(day)
                            ? "cursor-not-allowed text-ink-500"
                            : "text-ink-900 hover:bg-brand-50 hover:text-brand-800",
                        day === today && day !== selected && "ring-1 ring-inset ring-ink-300",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="mt-2 text-xs text-text-subtle">{note}</p> : null}
    </div>
  );
}
