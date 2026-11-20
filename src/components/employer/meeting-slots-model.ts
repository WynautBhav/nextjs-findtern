/**
 * What the meeting slot pickers refuse, as sentences for the form (B-42). Pure and free of the `@/` alias so the
 * node tests run it directly. The server holds the same rules (interviews route): this only says so before submit.
 */
import { isQuarterHourWall, wallNow } from "../../lib/employer-interview-rules.ts";

/** How far ahead a slot can be picked in the form. */
export const SLOT_MAX_DAYS = 14;

/** The slot picker's "today" and last pickable day, in the meeting's zone. */
export function slotWindow(timezone: string, now: number = Date.now()): { now: string; today: string; maxDate: string } {
  const wall = wallNow(timezone, now);
  const today = wall.slice(0, 10);
  const maxDate = new Date(Date.parse(`${today}T00:00:00Z`) + SLOT_MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  return { now: wall, today, maxDate };
}

/** Why slot `value` ("YYYY-MM-DDTHH:MM", wall clock in `timezone`) cannot be offered, or null. An empty one is not judged here. */
export function slotProblem(value: string, timezone: string, now: number = Date.now()): string | null {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const w = slotWindow(timezone, now);
  if (date < w.today) return "This date has passed. Pick today or a later date.";
  if (date > w.maxDate) return `Pick a date within the next ${SLOT_MAX_DAYS} days.`;
  const time = value.slice(11, 16);
  if (/^\d{2}:\d{2}$/.test(time) && `${date}T${time}` <= w.now) return "This time has passed. Pick a later time.";
  return null;
}

/** One message per slot (null when fine). */
export function slotProblems(slots: readonly string[], timezone: string, now: number = Date.now()): (string | null)[] {
  return slots.map((s) => slotProblem(s, timezone, now));
}

/** True while any slot is wrong, for disabling submit. */
export function hasSlotProblem(slots: readonly string[], timezone: string, now: number = Date.now()): boolean {
  return slotProblems(slots, timezone, now).some(Boolean);
}

/** An employer offer carries exactly three times: the candidate chooses one of them (the old platform's rule). */
export const REQUIRED_SLOTS = 3;

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The sentence that stops a send, or null: not exactly three times, a time left blank, off the quarter hour, or the same time
 * twice. Per-slot past/too-far problems are said under their own row (slotProblems); this is the whole-offer rule.
 */
export function offerProblem(slots: readonly string[]): string | null {
  const filled = slots.filter((s) => WALL.test(s)).length;
  if (slots.length !== REQUIRED_SLOTS || filled < REQUIRED_SLOTS) {
    return `Pick ${REQUIRED_SLOTS} times for the candidate to choose from (${filled} of ${REQUIRED_SLOTS} set). Set a date and time for every slot.`;
  }
  if (!slots.every(isQuarterHourWall)) return "Slots start on the hour or at :15, :30 or :45.";
  if (new Set(slots).size !== slots.length) return "Offer 3 different times: two slots are the same.";
  return null;
}

/** True when the offer cannot be sent yet (a wrong slot, or the whole-offer rule), for disabling submit. */
export function cannotSend(slots: readonly string[], timezone: string, now: number = Date.now()): boolean {
  return offerProblem(slots) !== null || hasSlotProblem(slots, timezone, now);
}
