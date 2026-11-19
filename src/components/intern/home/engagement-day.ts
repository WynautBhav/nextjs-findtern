import { todayIst } from "../../../lib/timesheet-days.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/**
 * The line after "<role> at <company>": "day N" counted from the offer's start date (not from when the hire was
 * recorded, which is days earlier), or "starts <date>" until that date. Without a usable start date it falls back
 * to the hire date. IST calendar days throughout, like the rest of the dashboard.
 */
export function engagementDayLabel(startDate: string | null | undefined, hiredAt: Date | null | undefined, now: Date): string | null {
  const start = startDate && DAY.test(startDate.slice(0, 10)) ? startDate.slice(0, 10) : hiredAt && hiredAt <= now ? todayIst(hiredAt) : null;
  if (!start) return null;
  const n = dayNumber(todayIst(now)) - dayNumber(start) + 1;
  if (n >= 1) return `day ${n}`;
  return `starts ${+start.slice(8, 10)} ${MONTHS[+start.slice(5, 7) - 1]}`;
}
