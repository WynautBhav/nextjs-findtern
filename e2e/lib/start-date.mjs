/**
 * Start dates for e2e offers. The server only takes a weekday (Monday to Friday) that is at least two days after
 * the day the offer is sent, in India (src/lib/business-days.ts), so "seven days from now" fails on a weekend run.
 * Plain JS with no imports so every spec can use it; src/lib/e2e-start-date.test.ts checks it against the real rule
 * for every weekday.
 */

const DAY = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
/** The server's lead: an offer sent on day D starts no earlier than D + 2, rolled forward to a weekday. */
export const MIN_LEAD_DAYS = 2;

/** The India calendar day `offsetDays` from `now`, as YYYY-MM-DD. */
export function istDay(offsetDays = 0, now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS + offsetDays * DAY).toISOString().slice(0, 10);
}

/** 0 Sunday .. 6 Saturday. */
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The first Monday-to-Friday day that is at least `minDaysAhead` (never less than 2) India days after `now`. */
export function businessStartDate(minDaysAhead = 7, now = new Date()) {
  let day = istDay(Math.max(MIN_LEAD_DAYS, minDaysAhead), now);
  while (weekday(day) === 0 || weekday(day) === 6) day = istDay(1, new Date(`${day}T00:00:00+05:30`));
  return day;
}

/** The first Saturday on or after `minDaysAhead` days from now: for specs that assert the server refuses a weekend. */
export function weekendStartDate(minDaysAhead = 7, now = new Date()) {
  let day = istDay(minDaysAhead, now);
  while (weekday(day) !== 6) day = istDay(1, new Date(`${day}T00:00:00+05:30`));
  return day;
}
