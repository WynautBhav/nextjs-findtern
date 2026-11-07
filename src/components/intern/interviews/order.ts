import { slotOf, type InterviewRow } from "../../../lib/journey.ts";

/**
 * Open company rounds in the order the intern acts on them: rounds still
 * waiting on their pick first (as stored), then booked ones, soonest first.
 */
export function splitUpcoming<T extends InterviewRow>(upcoming: T[]): { toPick: T[]; booked: T[] } {
  const toPick = upcoming.filter((i) => !i.selectedSlot);
  const booked = upcoming
    .filter((i) => Boolean(i.selectedSlot))
    .sort((x, y) => (slotOf(x)?.getTime() ?? 0) - (slotOf(y)?.getTime() ?? 0));
  return { toPick, booked };
}
