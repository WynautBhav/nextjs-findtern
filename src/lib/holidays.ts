/**
 * Indian gazetted holidays + working-week helpers for timesheets.
 *
 * Dates are the 2026 Central Government (DoPT) gazetted list, cross-checked
 * against incredibleindia.gov.in. Id-ul-Fitr / Id-ul-Zuha / Muharram /
 * Milad-un-Nabi are moon-dependent - if a state shifts one, the day dropdown
 * still lets the intern override, so a wrong prefill is one tap to fix, not
 * a wrong timesheet.
 */

/** `YYYY-MM-DD` → holiday name, 2026. 2027 is below; add each year's list when DoP&T publishes it. */
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

/**
 * 2027: Annexure I of DoP&T O.M. F.No. 12/2/2023-JCA dated 16.07.2026 (central
 * government offices, Delhi/New Delhi), as reproduced on staffnews.in and
 * gconnect.in; the 15 Aug and 29 Oct dates were checked on both. Independence
 * Day and Id-e-Milad fall on the same Sunday and no substitute day is given.
 * Id-ul-Fitr, Id-ul-Zuha, Muharram and Id-e-Milad follow the moon.
 */
export const GAZETTED_HOLIDAYS_2027: Record<string, string> = {
  "2027-01-26": "Republic Day",
  "2027-03-10": "Id-ul-Fitr",
  "2027-03-23": "Holi",
  "2027-03-26": "Good Friday",
  "2027-04-15": "Ram Navami",
  "2027-04-19": "Mahavir Jayanti",
  "2027-05-17": "Id-ul-Zuha",
  "2027-05-20": "Buddha Purnima",
  "2027-06-16": "Muharram",
  "2027-08-15": "Independence Day and Milad-un-Nabi",
  "2027-08-25": "Janmashtami",
  "2027-10-02": "Gandhi Jayanti",
  "2027-10-09": "Dussehra",
  "2027-10-29": "Diwali",
  "2027-11-14": "Guru Nanak's Birthday",
  "2027-12-25": "Christmas Day",
};

const GAZETTED_HOLIDAYS: Record<string, string> = { ...GAZETTED_HOLIDAYS_2026, ...GAZETTED_HOLIDAYS_2027 };

/** The newest year with a gazetted list here; later years show no prefilled holidays. */
export const HOLIDAYS_COVER_UNTIL_YEAR = 2027;

export function holidayName(dateISO: string): string | null {
  return GAZETTED_HOLIDAYS[dateISO] ?? null;
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
