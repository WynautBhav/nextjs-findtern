"use client";

import { useMemo, useRef, useState } from "react";

import { dayParts, weekdayOf } from "@/lib/timesheet-days";
import { cn } from "@/lib/utils";

/** One day of the internship: what its sheet says, if a sheet covers it. */
export type HeatDay = { date: string; hours: number; status: string; sheet: string | null };

const WEEKDAYS = [
  ["M", "Monday"],
  ["T", "Tuesday"],
  ["W", "Wednesday"],
  ["T", "Thursday"],
  ["F", "Friday"],
  ["S", "Saturday"],
  ["S", "Sunday"],
] as const;

/**
 * Hours per day across the whole internship, a month at a time. Each month
 * is a real table (screen readers read it as one); the days share one tab
 * stop and arrow keys move between them, so 180 days are not 180 tabs.
 * Hovering or focusing a day names its hours and its sheet underneath.
 */
export function HoursHeatmap({ days, today }: { days: HeatDay[]; today: string }) {
  const [active, setActive] = useState(() => {
    const i = days.findIndex((d) => d.date === today);
    return i >= 0 ? i : Math.max(0, days.findLastIndex((d) => d.date <= today));
  });
  const [shown, setShown] = useState<number | null>(null);
  const cells = useRef<(HTMLTableCellElement | null)[]>([]);

  const months = useMemo(() => {
    const out: { key: string; label: string; lead: number; items: { day: HeatDay; i: number }[] }[] = [];
    days.forEach((day, i) => {
      const key = day.date.slice(0, 7);
      if (out.at(-1)?.key !== key) {
        out.push({
          key,
          label: new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
          lead: (weekdayOf(day.date) + 6) % 7,
          items: [],
        });
      }
      out[out.length - 1].items.push({ day, i });
    });
    return out;
  }, [days]);

  function move(to: number) {
    const next = Math.max(0, Math.min(days.length - 1, to));
    setActive(next);
    setShown(next);
    cells.current[next]?.focus();
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) move(i + step);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(days.length - 1);
    else return;
    e.preventDefault();
  }

  const focusDay = shown === null ? null : days[shown];

  return (
    <div className="@container">
      <div className="grid items-start gap-x-8 gap-y-6 @xl:grid-cols-2 @4xl:grid-cols-3" onMouseLeave={() => setShown(null)}>
        {months.map((m) => (
          <table key={m.key} className="w-full table-fixed border-separate border-spacing-1">
            <caption className="pb-2 text-left text-sm font-semibold text-ink-900">{m.label}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([short, full], k) => (
                  <th key={k} scope="col" abbr={full} className={cn("pb-1 text-center text-xs font-medium", k >= 5 ? "text-text-subtle" : "text-ink-600")}>
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks(m.lead, m.items).map((week, w) => (
                <tr key={w}>
                  {week.map((cell, k) =>
                    cell ? (
                      <td
                        key={cell.day.date}
                        ref={(el) => {
                          cells.current[cell.i] = el;
                        }}
                        tabIndex={cell.i === active ? 0 : -1}
                        onKeyDown={(e) => onKey(e, cell.i)}
                        onFocus={() => {
                          setActive(cell.i);
                          setShown(cell.i);
                        }}
                        onMouseEnter={() => setShown(cell.i)}
                        className="rounded-apple-sm p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        {/* Table cells ignore aspect-ratio, so the square is the span inside. */}
                        <span
                          aria-hidden
                          className={cn(
                            "nums grid aspect-square place-items-center rounded-apple-sm text-xs font-medium",
                            tone(cell.day, today, k >= 5),
                            cell.day.date === today && "ring-2 ring-ink-900 ring-offset-2 ring-offset-surface-raised",
                          )}
                        >
                          {Number(cell.day.date.slice(8, 10))}
                        </span>
                        <span className="sr-only">
                          {dayParts(cell.day.date).date}
                          {cell.day.date === today ? ", today" : ""}: {describe(cell.day, today)}
                        </span>
                      </td>
                    ) : (
                      <td key={`pad-${k}`} aria-hidden />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* The readout repeats what the focused cell already says aloud, so only sighted users get it. */}
      <p aria-hidden className="mt-4 min-h-6 text-sm text-ink-700">
        {focusDay ? (
          <>
            <span className="font-semibold text-ink-900">
              {dayParts(focusDay.date).weekday} {dayParts(focusDay.date).date}
            </span>{" "}
            · {describe(focusDay, today)}
          </>
        ) : (
          <span className="text-text-subtle">Point at or tab to a day to see its hours.</span>
        )}
      </p>

      <div aria-hidden className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          Fewer hours
          {RAMP.map((c) => (
            <span key={c} className={cn("size-3.5 rounded-[4px]", c)} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] bg-ink-100" />
          Off or away
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] border border-dashed border-ink-400" />
          Not logged
        </span>
      </div>
    </div>
  );
}

const RAMP = ["bg-brand-100", "bg-brand-300", "bg-brand-500", "bg-brand-700"] as const;

/** The brand ramp by hours; a Present day with no hours is the palest step. */
function tone(d: HeatDay, today: string, weekend: boolean): string {
  // Older sheets carry hours without a status; hours logged is the signal either way.
  if (d.status === "Present" || d.hours > 0) {
    if (d.hours <= 0) return "bg-brand-50 text-ink-900 ring-1 ring-inset ring-brand-200";
    if (d.hours <= 3) return `${RAMP[0]} text-ink-900`;
    if (d.hours <= 6) return `${RAMP[1]} text-brand-950`;
    if (d.hours <= 8) return `${RAMP[2]} text-white`;
    return `${RAMP[3]} text-white`;
  }
  if (d.status) return "bg-ink-100 text-ink-600";
  if (d.date > today) return "text-text-subtle";
  if (weekend) return "bg-ink-50 text-text-subtle";
  return "border border-dashed border-ink-400 text-ink-700";
}

function describe(d: HeatDay, today: string): string {
  const hours = d.hours > 0 ? `${Number(d.hours.toFixed(2))} h` : null;
  if (!d.sheet) return d.date > today ? "Ahead" : "Not on a timesheet yet";
  const what = [d.status && d.status !== "Present" ? d.status : null, hours ?? (d.status === "Present" ? "Present, no hours" : d.status ? null : "Not marked")];
  return [...what.filter(Boolean), d.sheet].join(" · ");
}

/** Monday-first rows of seven, padded before the first day and after the last. */
function weeks<T>(lead: number, items: T[]): (T | null)[][] {
  const flat: (T | null)[] = [...Array<null>(lead).fill(null), ...items];
  while (flat.length % 7) flat.push(null);
  const out: (T | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) out.push(flat.slice(i, i + 7));
  return out;
}
