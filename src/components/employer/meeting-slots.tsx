"use client";

/**
 * Three meeting slots, each a date plus a quarter-hour time (:00, :15, :30,
 * :45), as the legacy cart dialog had (employer-cart.tsx:3961). A plain
 * datetime-local input ignores `step` in most browsers' pickers, so any
 * minute could be typed; a time list cannot drift off the quarter hour.
 *
 * Values are wall-clock "YYYY-MM-DDTHH:MM" strings in `timezone`; the server
 * converts them.
 */

import { TIMEZONES } from "@/lib/timezones";
import { SLOT_MINUTES, wallNow } from "@/lib/employer-interview-rules";

export type Slots = [string, string, string];

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

const FIELD =
  "apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] tabular-nums text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export function MeetingSlots({
  slots,
  onChange,
  timezone,
  disabled,
}: {
  slots: Slots;
  onChange: (next: Slots) => void;
  timezone: string;
  disabled?: boolean;
}) {
  // "Now" in the meeting's timezone, so today's past times are not offered.
  const now = wallNow(timezone);
  const today = now.slice(0, 10);
  const maxDate = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);

  function set(idx: number, value: string) {
    const next = [...slots] as Slots;
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
            <legend className="mb-1 text-xs font-semibold text-ink-800">Slot {idx + 1} *</legend>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={date}
                min={today}
                max={maxDate}
                onChange={(e) => set(idx, e.target.value ? `${e.target.value}T${time || "09:00"}` : "")}
                aria-label={`Slot ${idx + 1} date`}
                className={FIELD}
              />
              <select
                required
                value={time}
                onChange={(e) => set(idx, `${date || today}T${e.target.value}`)}
                aria-label={`Slot ${idx + 1} time`}
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
