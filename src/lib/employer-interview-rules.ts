/**
 * Interview timing rules shared by the employer screens and the APIs, ported
 * from the legacy server (routes.ts 890-930, 11370, 11851, 12880).
 *
 * Kept import-free so `node --test` can exercise it without the `@/` alias.
 */

type SlotLike = {
  status: string | null;
  slot1: Date | string | null;
  slot2: Date | string | null;
  slot3: Date | string | null;
  selectedSlot?: number | null;
};

const OPEN_STATUSES = ["pending", "scheduled", "waiting"];

/** Minutes after the slot start that "mark missed" stays locked. */
export const MISSED_GRACE_MINUTES = 15;
/** The meeting link is hidden this long after the slot starts. */
export const LINK_VISIBLE_MINUTES = 60;

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Every proposed slot, as epoch ms, skipping empty ones. */
export function slotTimes(iv: SlotLike): number[] {
  return [iv.slot1, iv.slot2, iv.slot3].map(toTime).filter((t): t is number => t !== null);
}

/**
 * The slot the meeting runs at: the chosen one, else the first slot that is
 * set (legacy fell back to the first non-empty slot, not to slot 1).
 */
export function meetingTime(iv: SlotLike): number | null {
  const chosen = iv.selectedSlot ? toTime([iv.slot1, iv.slot2, iv.slot3][iv.selectedSlot - 1]) : null;
  return chosen ?? slotTimes(iv)[0] ?? null;
}

/**
 * An open interview whose every proposed slot is in the past. It no longer
 * blocks a new proposal or interview, and reads as expired.
 */
export function isStaleInterview(iv: SlotLike, now: number = Date.now()): boolean {
  if (!OPEN_STATUSES.includes(iv.status ?? "")) return false;
  const times = iv.selectedSlot ? [meetingTime(iv)].filter((t): t is number => t !== null) : slotTimes(iv);
  return times.length > 0 && times.every((t) => t < now);
}

/** Open and not stale: the interview still holds the candidate. */
export function isBlockingInterview(iv: SlotLike, now: number = Date.now()): boolean {
  return OPEN_STATUSES.includes(iv.status ?? "") && !isStaleInterview(iv, now);
}

/** Status to display: open interviews whose slots all passed show "expired". */
export function displayInterviewStatus(iv: SlotLike, now: number = Date.now()): string {
  return isStaleInterview(iv, now) ? "expired" : (iv.status ?? "");
}

/** Whether the join link should still be offered (until 1h after the start). */
export function isMeetingLinkLive(iv: SlotLike, now: number = Date.now()): boolean {
  const t = meetingTime(iv);
  return t === null || now <= t + LINK_VISIBLE_MINUTES * 60_000;
}

/** "Mark missed" is allowed only once the slot plus the grace period passed. */
export function canMarkMissed(iv: SlotLike, now: number = Date.now()): boolean {
  const t = meetingTime(iv);
  return t !== null && now >= t + MISSED_GRACE_MINUTES * 60_000;
}

/** Feedback is allowed once the meeting time has passed. */
export function meetingHasStarted(iv: SlotLike, now: number = Date.now()): boolean {
  const t = meetingTime(iv);
  return t !== null && now >= t;
}

/** Three proposed slots must be distinct instants. */
export function hasDuplicateSlots(slots: (Date | string)[]): boolean {
  const times = slots.map((s) => new Date(s).getTime());
  return new Set(times).size !== times.length;
}

/** Interview slots start on the quarter hour (:00, :15, :30, :45). */
export const SLOT_MINUTES = [0, 15, 30, 45] as const;

/** True for a wall-clock "YYYY-MM-DDTHH:MM" whose minutes are a quarter hour. */
export function isQuarterHourWall(wall: string): boolean {
  const m = /T\d{2}:(\d{2})/.exec(wall);
  return Boolean(m) && (SLOT_MINUTES as readonly number[]).includes(Number(m![1]));
}

/** Wall-clock fields of `ms` in `timeZone`, as a UTC-epoch stand-in. */
function wallEpoch(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function wallString(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 16);
}

/**
 * Suggested slots (sheet row 66): the first quarter hour at least an hour
 * from now in the interview's timezone, then one and two hours after it.
 * Wall-clock strings, editable by the employer.
 */
export function suggestedSlots(now: number, timeZone: string): [string, string, string] {
  const base = wallEpoch(now + 60 * 60_000, timeZone);
  const quarter = 15 * 60_000;
  const first = Math.ceil(base / quarter) * quarter;
  return [wallString(first), wallString(first + 60 * 60_000), wallString(first + 120 * 60_000)];
}
