/**
 * The meeting-proposal state machine, pure (no database, no `@/` alias, so `node --test` runs it).
 *
 * Only the EMPLOYER proposes times, and always exactly three. The intern picks one of them or cancels; interns can no
 * longer ask to reschedule (`request_reschedule` is always refused). A request made earlier still reads as pending with
 * `proposedBy = "intern"` and no slots: "the employer must offer three new times". An offer lapses at `respondBy` (earliest
 * slot minus 2 h). A pick or an offer is refused when it overlaps another confirmed meeting of either party (+-30 min).
 *
 * `round` counts offers and requests (a revision number, no cap). Rows from before migration 0043 read as round 1, proposed
 * by the employer, with no respondBy. A row an intern proposed under the earlier rules (`proposedBy = "intern"` with times)
 * still renders: the employer may pick one of its times, offer three of their own, or either side may cancel.
 * Routes translate a successful `step` into one status-guarded UPDATE, so a stale or double click is a 409.
 */

import { hasDuplicateSlots, hasSlotTooFarAhead } from "../employer-interview-rules.ts";
import { MEETING_MINUTES } from "../interview-lifecycle.ts";

export type Role = "employer" | "intern";
/** An employer offer is exactly this many times. */
export const REQUIRED_SLOTS = 3;
/** An offer must be answered this long before its earliest slot. */
export const RESPOND_LEAD_MS = 2 * 60 * 60_000;
export const MEETING_MS = MEETING_MINUTES * 60_000;
export const REASON_MIN = 3;
export const REASON_MAX = 300;

type When = Date | string | null | undefined;

export type MeetingState = {
  status: string | null;
  proposedBy?: string | null;
  round?: number | null;
  respondBy?: When;
  slot1: When;
  slot2: When;
  slot3: When;
  selectedSlot?: number | null;
};

export const otherRole = (r: Role): Role => (r === "employer" ? "intern" : "employer");

const ms = (d: When): number | null => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

export const slotsOf = (s: MeetingState): (number | null)[] => [ms(s.slot1), ms(s.slot2), ms(s.slot3)];
const offered = (s: MeetingState): number[] => slotsOf(s).filter((t): t is number => t !== null);
export const proposerOf = (s: MeetingState): Role => (s.proposedBy === "intern" ? "intern" : "employer");
export const roundOf = (s: MeetingState): number => Math.max(1, s.round ?? 1);

/** Start of the booked slot, or null. */
export function bookedStart(s: MeetingState): number | null {
  if (!s.selectedSlot || s.selectedSlot < 1 || s.selectedSlot > 3) return null;
  return slotsOf(s)[s.selectedSlot - 1];
}

/** earliest slot - 2 h; when that is already past, the offer holds until the earliest slot starts. */
export function respondByFor(slots: Date[], now: number = Date.now()): Date {
  const earliest = Math.min(...slots.map((d) => d.getTime()));
  const lead = earliest - RESPOND_LEAD_MS;
  return new Date(lead > now ? lead : earliest);
}

export type Refusal = { ok: false; code: string; error: string };
const refuse = (code: string, error: string): Refusal => ({ ok: false, code, error });

/** What an offer of `slots` (UTC instants) must satisfy. Exactly three, on the quarter hour, future, within a year, distinct. */
export function checkOffer(slots: Date[], now: number = Date.now()): { ok: true; slots: Date[]; respondBy: Date } | Refusal {
  if (slots.length !== REQUIRED_SLOTS) return refuse("need_three_slots", "Offer exactly three time slots for the candidate to choose from.");
  if (slots.some((d) => Number.isNaN(d.getTime()))) return refuse("bad_slot", "One of the time slots is not valid.");
  if (!slots.every((d) => d.getUTCSeconds() === 0 && d.getUTCMinutes() % 15 === 0)) {
    return refuse("not_quarter_hour", "Slots start on the hour or at :15, :30 or :45.");
  }
  if (slots.some((d) => d.getTime() < now)) return refuse("slot_past", "Slots must be in the future");
  if (hasSlotTooFarAhead(slots, now)) return refuse("slot_far", "Pick slots within the next year.");
  if (hasDuplicateSlots(slots)) return refuse("slot_duplicate", "Offer different time slots - two slots are the same.");
  const sorted = [...slots].sort((a, b) => a.getTime() - b.getTime());
  return { ok: true, slots: sorted, respondBy: respondByFor(sorted, now) };
}

/** Whether another confirmed meeting at `otherStart` overlaps a 30-minute meeting at `start` (+-30 min). */
export const overlaps = (start: number, otherStart: number): boolean => Math.abs(start - otherStart) < MEETING_MS;

/** The first of `busy` (start times of both parties' other confirmed meetings) that clashes with `start`, or null. */
export const firstConflict = (start: number, busy: number[]): number | null => busy.find((b) => overlaps(start, b)) ?? null;

/** Whether the standing offer can no longer be answered: past respondBy, or every offered time has started. */
export function isLapsed(s: MeetingState, now: number = Date.now()): boolean {
  const open = ["pending", "waiting", "proposed"].includes((s.status ?? "").toLowerCase());
  if (!open || s.selectedSlot) return false;
  const by = ms(s.respondBy);
  if (by !== null && by <= now) return true;
  const times = offered(s);
  return times.length > 0 && times.every((t) => t <= now);
}

const isPending = (s: MeetingState) => (s.status ?? "").toLowerCase() === "pending";

/** An old intern reschedule request (no longer creatable) the employer has not answered yet: pending, no times, the intern's marker. */
export const isRescheduleRequest = (s: MeetingState): boolean => isPending(s) && s.proposedBy === "intern" && offered(s).length === 0;

/** The side that did not make the standing offer may pick from it (the intern from the employer's three; the employer only from a pre-change intern offer). */
export function canChoose(s: MeetingState, role: Role, now: number = Date.now()): { ok: true } | Refusal {
  if (!isPending(s)) return refuse("not_pending", `This meeting is already ${(s.status ?? "closed").toLowerCase()}`);
  if (isRescheduleRequest(s)) return refuse("awaiting_times", "Waiting for the company to offer new time slots.");
  if (proposerOf(s) === role) return refuse("own_offer", "You made this offer; the other side picks.");
  if (isLapsed(s, now)) return refuse("lapsed", "This offer has lapsed. The company can offer new time slots.");
  return { ok: true };
}

/** Cancel while the meeting is still ahead: an open offer that has not lapsed, or a booked one that has not started. A lapsed offer reads expired, so it is not cancellable. */
export function canCancel(s: MeetingState, now: number = Date.now()): { ok: true } | Refusal {
  const status = (s.status ?? "").toLowerCase();
  if (status === "pending") return isLapsed(s, now) ? refuse("lapsed", "This offer has expired. The company can offer new time slots.") : { ok: true };
  if (status === "scheduled") {
    const start = bookedStart(s) ?? offered(s)[0] ?? null;
    return start !== null && start <= now ? refuse("started", "This meeting has started. Mark it completed or missed instead.") : { ok: true };
  }
  return refuse("not_open", `This meeting is already ${status || "closed"}`);
}

/** The employer offers three new times: for a booked, expired, requested or still-open meeting. Interns never offer times. */
export function canReschedule(s: MeetingState, role: Role): { ok: true } | Refusal {
  if (role !== "employer") return refuse("employer_only", "Only the company offers time slots.");
  const status = (s.status ?? "").toLowerCase();
  if (status === "scheduled" || status === "expired" || status === "pending") return { ok: true };
  return refuse("not_open", `This meeting is already ${status || "closed"}`);
}

export function reasonProblem(reason: unknown): string | null {
  // Optional (bug sheet 25 Nov): blank cancels without one; a typed reason is a few words.
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length > 0 && r.length < REASON_MIN) return "Write a few words, or leave the reason empty.";
  if (r.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

export type Action =
  | { type: "propose"; by: Role; slots: Date[]; busy?: number[] }
  | { type: "choose"; by: Role; slot: number; busy?: number[] }
  | { type: "reschedule"; by: Role; slots: Date[]; busy?: number[] }
  /** Always refused: kept so a stale client or a direct API call gets an explicit error. */
  | { type: "request_reschedule"; by: Role; reason?: string }
  | { type: "cancel"; by: Role; reason?: string | null }
  | { type: "expire" };

export type Fields = {
  status: string;
  proposedBy: Role;
  round: number;
  respondBy: Date | null;
  slot1: Date | null;
  slot2: Date | null;
  slot3: Date | null;
  selectedSlot: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
};

const fresh = (round: number, offer: { slots: Date[]; respondBy: Date }): Fields => ({
  status: "pending",
  proposedBy: "employer",
  round,
  respondBy: offer.respondBy,
  slot1: offer.slots[0] ?? null,
  slot2: offer.slots[1] ?? null,
  slot3: offer.slots[2] ?? null,
  selectedSlot: null,
  cancelledBy: null,
  cancelReason: null,
});

const CLASH_OFFER = "One of these time slots clashes with another meeting. Pick different time slots.";

/** Checks an employer offer (three future distinct quarter-hour times that clash with no confirmed meeting of either party). */
function employerOffer(slots: Date[], busy: number[] | undefined, now: number) {
  const offer = checkOffer(slots, now);
  if (!offer.ok) return offer;
  if (offer.slots.some((d) => firstConflict(d.getTime(), busy ?? []) !== null)) return refuse("conflict", CLASH_OFFER);
  return offer;
}

/**
 * The row's new fields after `action`, or the refusal. `current` is undefined only for "propose" (a new meeting).
 * Pure: the caller supplies `now` and `busy` (the other confirmed meetings of both parties) for a pick or an offer.
 */
export function step(current: MeetingState | undefined, action: Action, now: number = Date.now()): { ok: true; fields: Fields } | Refusal {
  if (action.type === "propose") {
    if (action.by !== "employer") return refuse("employer_only", "Only the company offers time slots.");
    const offer = employerOffer(action.slots, action.busy, now);
    return offer.ok ? { ok: true, fields: fresh(1, offer) } : offer;
  }
  if (!current) return refuse("not_found", "Not found");

  if (action.type === "expire") {
    if (!isLapsed(current, now)) return refuse("not_lapsed", "Not lapsed");
    return { ok: true, fields: { ...keep(current), status: "expired" } };
  }

  if (action.type === "choose") {
    const c = canChoose(current, action.by, now);
    if (!c.ok) return c;
    const start = [current.slot1, current.slot2, current.slot3].map(ms)[action.slot - 1];
    if (action.slot < 1 || action.slot > 3 || start === null || start === undefined) return refuse("slot_not_offered", "That slot wasn't offered");
    if (start <= now) return refuse("slot_past", "That slot has passed");
    if (firstConflict(start, action.busy ?? []) !== null) {
      return refuse("conflict", "That time clashes with another meeting. Pick a different time.");
    }
    return { ok: true, fields: { ...keep(current), status: "scheduled", selectedSlot: action.slot } };
  }

  if (action.type === "reschedule") {
    const c = canReschedule(current, action.by);
    if (!c.ok) return c;
    const offer = employerOffer(action.slots, action.busy, now);
    return offer.ok ? { ok: true, fields: fresh(roundOf(current) + 1, offer) } : offer;
  }

  // Interns can no longer ask to reschedule; the employer is the only side that moves a meeting's times.
  if (action.type === "request_reschedule") return refuse("intern_reschedule_removed", "Rescheduling is not available. Choose one of the offered times, or decline.");

  const c = canCancel(current, now);
  if (!c.ok) return c;
  const problem = reasonProblem(action.reason);
  if (problem) return refuse("reason_required", problem);
  return { ok: true, fields: { ...keep(current), status: "cancelled", cancelledBy: action.by, cancelReason: action.reason?.trim() || null } };
}

function keep(s: MeetingState): Fields {
  const d = (v: When) => (v ? new Date(v) : null);
  return {
    status: (s.status ?? "pending").toLowerCase(),
    proposedBy: proposerOf(s),
    round: roundOf(s),
    respondBy: d(s.respondBy),
    slot1: d(s.slot1),
    slot2: d(s.slot2),
    slot3: d(s.slot3),
    selectedSlot: s.selectedSlot ?? null,
    cancelledBy: null,
    cancelReason: null,
  };
}

/** What one side can do with a meeting right now, for the screens (the routes re-check on submit). */
export type MeetingView = {
  turn: "yours" | "theirs" | "none";
  canChoose: boolean;
  canCancel: boolean;
  /** Employer: offer three new times. Always false for the intern. */
  canReschedule: boolean;
  /** An intern request made before interns lost reschedule: the employer still owes three new times. */
  requested: boolean;
  round: number;
  lapsed: boolean;
};

export function viewFor(s: MeetingState, role: Role, now: number = Date.now()): MeetingView {
  const choose = canChoose(s, role, now).ok;
  const status = (s.status ?? "").toLowerCase();
  const lapsed = isLapsed(s, now);
  return {
    turn: choose ? "yours" : status === "pending" && !lapsed ? "theirs" : "none",
    canChoose: choose,
    canCancel: canCancel(s, now).ok,
    canReschedule: canReschedule(s, role).ok,
    requested: isRescheduleRequest(s),
    round: roundOf(s),
    lapsed,
  };
}
