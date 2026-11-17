/**
 * Pure pieces of the day calendar (Monday-first month grid and keyboard moves) on India calendar days "YYYY-MM-DD".
 * Import-free so the node tests run it directly.
 */

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

export const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });

/** Column heading, Monday first: 0 -> Mon .. 6 -> Sun. */
export const weekdayLabel = (col: number) => WEEKDAYS[col];

export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

/** A month number outside 1..12 rolls the year. */
export function clampMonth(year: number, month: number): { year: number; month: number } {
  const index = year * 12 + (month - 1);
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** The weeks of a month, Monday first; null where a week spills into the neighbouring month. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday is column 0
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, i) => isoOf(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** `iso` moved by whole days, then by whole months (day of month kept, clamped to the shorter month). */
export function moveDay(iso: string, days: number, months = 0): string {
  let out = iso;
  if (days) out = new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);
  if (months) {
    const { y, m, d } = parts(out);
    const to = clampMonth(y, m + months);
    const last = new Date(Date.UTC(to.year, to.month, 0)).getUTCDate();
    out = isoOf(to.year, to.month, Math.min(d, last));
  }
  return out;
}

/** The first day from `from` on that is not disabled (looks a year ahead); `from` itself when every day is. */
export function nextOpenDay(from: string, isDisabled: (iso: string) => boolean): string {
  let day = from;
  for (let i = 0; i < 366; i++) {
    if (!isDisabled(day)) return day;
    day = moveDay(day, 1);
  }
  return from;
}
