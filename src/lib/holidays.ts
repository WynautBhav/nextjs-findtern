/**
 * Indian gazetted holidays + working-week helpers for timesheets.
 *
 * Dates are the 2026 Central Government (DoPT) gazetted list, cross-checked
 * against incredibleindia.gov.in. Id-ul-Fitr / Id-ul-Zuha / Muharram /
 * Milad-un-Nabi are moon-dependent - if a state shifts one, the day dropdown
 * still lets the intern override, so a wrong prefill is one tap to fix, not
 * a wrong timesheet.
 */

/** `YYYY-MM-DD` → holiday name. 2026 only; extend per year as needed. */
export const GAZETTED_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-26": "Republic Day",
  "2026-03-04": "Holi",
  "2026-03-21": "Id-ul-Fitr",
  "2026-03-26": "Ram Navami",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. B.R. Ambedkar Jayanti",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Milad-un-Nabi",
  "2026-09-04": "Janmashtami",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali",
  "2026-11-24": "Guru Nanak's Birthday",
  "2026-12-25": "Christmas Day",
};

export function holidayName(dateISO: string): string | null {
  return GAZETTED_HOLIDAYS_2026[dateISO] ?? null;
}

/** Saturday or Sunday. Parsed at noon UTC so the date never shifts a day. */
export function isWeekendISO(dateISO: string): boolean {
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The status a fresh day row starts with: gazetted holidays come
 * pre-marked, weekends default to Fixed off (Mon–Fri is the working week),
 * weekdays start blank for the intern to fill. Always overridable.
 */
export function defaultDayStatus(dateISO: string): "" | "Fixed off" | "Holiday" {
  if (holidayName(dateISO)) return "Holiday";
  if (isWeekendISO(dateISO)) return "Fixed off";
  return "";
}
