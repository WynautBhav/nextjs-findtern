"use client";

/**
 * One to three meeting slots, each a date plus a quarter-hour time (:00, :15, :30,
 * :45), as the legacy cart dialog had (employer-cart.tsx:3961). A plain
 * datetime-local input ignores `step` in most browsers' pickers, so any
 * minute could be typed; a time list cannot drift off the quarter hour.
 *
 * Values are wall-clock "YYYY-MM-DDTHH:MM" strings in `timezone`; the server
 * converts them.
 */

import { useId } from "react";
import { X } from "lucide-react";

import { TIMEZONES } from "@/lib/timezones";
import { SLOT_MINUTES } from "@/lib/employer-interview-rules";
import { slotProblems, slotWindow } from "@/components/employer/meeting-slots-model";
import { DmyDateInput } from "@/components/app/dmy-date-input";
import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";

/** One to three wall-clock times. */
export type Slots = string[];

/** "00:00" … "23:45". */
const TIMES = Array.from({ length: 24 * SLOT_MINUTES.length }, (_, i) => {
  const h = Math.floor(i / SLOT_MINUTES.length);
  const m = SLOT_MINUTES[i % SLOT_MINUTES.length];
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

/** "14:30" → "2:30 pm". */
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const FIELD = cn(fieldClass, "tabular-nums");

export function MeetingSlots({
  slots,
  onChange,
  timezone,
  disabled,
  invalid,
  describedBy,
  onRemove,
}: {
  slots: Slots;
  onChange: (next: Slots) => void;
  /** Given, each slot gets a Remove control (the caller keeps at least one). */
  onRemove?: (idx: number) => void;
  timezone: string;
  disabled?: boolean;
  /** A message about the slots is showing: mark the controls and tie them to it. */
  invalid?: boolean;
  describedBy?: string;
}) {
  // "Now" in the meeting's timezone, so today's past times are not offered.
  const errId = useId();
  const { now, today } = slotWindow(timezone);
  // A wrong slot is said in the page, under its own row, not by the browser's min/max tooltip (B-42); the form
  // button is disabled on the same rule (hasSlotProblem).
  const problems = slotProblems(slots, timezone);

  function set(idx: number, value: string) {
    const next = [...slots];
    next[idx] = value;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {slots.map((value, idx) => {
        const date = value.slice(0, 10);
        const time = value.slice(11, 16);
        const others = slots.filter((_, i) => i !== idx);
        return (
          <fieldset key={idx} disabled={disabled} className="min-w-0">
            <legend className="mb-1.5 w-full text-sm font-medium text-ink-800">
              <span className="flex items-center justify-between gap-2">
                Slot {idx + 1}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    aria-label={`Remove slot ${idx + 1}`}
                    className="-my-3 inline-flex min-h-11 items-center gap-1 rounded-apple-sm px-2 text-sm font-normal text-ink-600 outline-none transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <X className="size-4" aria-hidden />
                    Remove
                  </button>
                ) : null}
              </span>
            </legend>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
              <DmyDateInput
                required
                value={date}
                onChange={(iso) => set(idx, iso ? `${iso}T${time || "09:00"}` : "")}
                aria-label={`Slot ${idx + 1} date`}
                aria-invalid={invalid || problems[idx] ? true : undefined}
                aria-describedby={cn(problems[idx] && `${errId}-${idx}`, invalid && describedBy) || undefined}
                className={cn(FIELD, problems[idx] && "border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20")}
              />
              <select
                required
                value={time}
                onChange={(e) => set(idx, `${date || today}T${e.target.value}`)}
                aria-label={`Slot ${idx + 1} time`}
                aria-invalid={invalid || problems[idx]?.includes("time") ? true : undefined}
                aria-describedby={cn(problems[idx] && `${errId}-${idx}`, invalid && describedBy) || undefined}
                className={FIELD}
              >
                <option value="" disabled>
                  Time
                </option>
                {TIMES.filter((t) => (date || today) > today || `${today}T${t}` > now).map((t) => (
                  <option key={t} value={t} disabled={others.includes(`${date || today}T${t}`)}>
                    {timeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            {problems[idx] ? (
              <p id={`${errId}-${idx}`} role="alert" className="mt-1.5 text-xs text-danger">
                {problems[idx]}
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

export function TimezoneSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={FIELD}>
      {TIMEZONES.map((option) =>
        option.group ? (
          <option key={option.id} value={option.id} disabled>
            ── {option.label} ──
          </option>
        ) : (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ),
      )}
    </select>
  );
}
