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
/** How long a meeting runs (legacy employer-schedule.tsx:898, start + 30 min). */
export const MEETING_MINUTES = 30;

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

/**
 * When the meeting is over: the picked slot plus the meeting length, or -
 * while the candidate has not picked yet - the last offered slot plus it.
 */
export function meetingEndsAt(iv: SlotLike): number | null {
  const times = iv.selectedSlot ? [meetingTime(iv)].filter((t): t is number => t !== null) : slotTimes(iv);
  return times.length > 0 ? Math.max(...times) + MEETING_MINUTES * 60_000 : null;
}

/**
 * Open and not over yet: the interview still holds the candidate, so a new
 * meeting can't be booked until this one's time has run out (bug sheet 26 Oct).
 */
export function isBlockingInterview(iv: SlotLike, now: number = Date.now()): boolean {
  if (!OPEN_STATUSES.includes(iv.status ?? "")) return false;
  const end = meetingEndsAt(iv);
  return end !== null && now < end;
}

/**
 * The meeting has happened: marked completed, or a scheduled meeting whose
 * time slot has run out. Feedback opens only then (bug sheet 26 Oct).
 */
export function isMeetingOver(iv: SlotLike, now: number = Date.now()): boolean {
  const status = (iv.status ?? "").toLowerCase();
  if (status === "completed") return true;
  if (status !== "scheduled" || !iv.selectedSlot) return false;
  const end = meetingEndsAt(iv);
  return end !== null && now >= end;
}

/**
 * Status to display: a booked meeting whose time is over reads "completed"
 * (legacy isEffectivelyCompleted, employer-schedule.tsx:901); an invite whose
 * slots all passed unpicked reads "expired".
 */
export function displayInterviewStatus(iv: SlotLike, now: number = Date.now()): string {
  if ((iv.status ?? "") === "scheduled" && isMeetingOver(iv, now)) return "completed";
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

/** The current wall-clock time in `timeZone`, as "YYYY-MM-DDTHH:MM". */
export function wallNow(timeZone: string, now: number = Date.now()): string {
  return wallString(wallEpoch(now, timeZone));
}

/**
 * Suggested slots (bug sheet 7, Sheet2 r2): the next quarter hour (:00, :15,
 * :30, :45) after now in the interview's timezone, then one and two hours
 * after it: 12:34 → 12:45, 13:45, 14:45. Wall-clock strings, editable by the
 * employer. Exactly on a quarter moves to the next one, so a slot is never
 * "now".
 */
export function suggestedSlots(now: number, timeZone: string): [string, string, string] {
  const base = wallEpoch(now, timeZone);
  const quarter = 15 * 60_000;
  const first = (Math.floor(base / quarter) + 1) * quarter;
  return [wallString(first), wallString(first + 60 * 60_000), wallString(first + 120 * 60_000)];
}

/**
 * Where an interview is in its life, from the employer's side. The schedule
 * shows only the actions that mean something at each stage (DESIGN.md §7.5):
 *
 *   awaiting_pick  invite sent, candidate hasn't picked  → remind, reschedule
 *   expired        every offered slot passed unpicked     → reschedule
 *   upcoming       a slot is booked and still ahead       → join, remind, reschedule
 *   live           the booked half hour is running         → join, mark missed (after grace)
 *   over           the meeting is done                     → feedback, mark missed
 *   missed         marked missed                           → feedback (legacy allowed it, EMB-22)
 *   closed         cancelled or otherwise finished         → read feedback only
 */
export type InterviewStage = "awaiting_pick" | "expired" | "upcoming" | "live" | "over" | "missed" | "closed";

export function interviewStage(iv: SlotLike, now: number = Date.now()): InterviewStage {
  const status = (iv.status ?? "").toLowerCase();
  if (status === "missed") return "missed";
  if (status === "completed") return "over";
  if (status === "pending" || status === "waiting") return isStaleInterview(iv, now) ? "expired" : "awaiting_pick";
  if (status === "scheduled") {
    const t = meetingTime(iv);
    if (!iv.selectedSlot || t === null) return "upcoming";
    if (now < t) return "upcoming";
    return now < t + MEETING_MINUTES * 60_000 ? "live" : "over";
  }
  return "closed";
}

/** Sort rank for the schedule list (legacy employer-schedule.tsx:363): booked, waiting, expired, done. */
export function stageRank(stage: InterviewStage): number {
  switch (stage) {
    case "live":
    case "upcoming":
      return 0;
    case "awaiting_pick":
      return 1;
    case "expired":
      return 2;
    case "over":
    case "missed":
      return 3;
    default:
      return 4;
  }
}

/** Feedback can be written once the meeting is over, or after it was marked missed (EMB-22). */
export function canLeaveFeedback(iv: SlotLike, now: number = Date.now()): boolean {
  return (iv.status ?? "").toLowerCase() === "missed" || isMeetingOver(iv, now);
}

/** Legacy opened links typed without a scheme as https (employer-schedule.tsx:102). */
export function normalizeMeetingLink(raw: string | null | undefined): string | null {
  const link = String(raw ?? "").trim();
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}
