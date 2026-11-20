/**
 * One place that says what state an interview is in, so a meeting whose time has passed can never read "Scheduled".
 *
 * The rules (all instants are UTC epoch ms; each screen formats them in its own zone, as it did before):
 *  - completed, missed, cancelled, declined, rescheduled keep their meaning, however old.
 *  - A BOOKED interview (the candidate picked a slot) is over MEETING_MINUTES after that slot starts. If it is still
 *    `scheduled` then, nobody marked it completed or cancelled: it is `expired`, reason "Time passed, not marked complete".
 *  - An INVITE (no usable pick yet: pending / waiting / proposed, or scheduled with no chosen slot) whose every offered slot
 *    has started is `expired`: nothing is left to pick. One slot still ahead keeps it open.
 *  - A booked interview that has started and not ended is `live`; one that has not started is `upcoming`.
 *  - A row already persisted as `expired` stays expired. The sweep (proposal-expiry-db.ts) writes that; this makes the screens
 *    right before it runs.
 *  - The AI interview (employer id "admin", or `isAi`) has its own expiry (admin/ai-interview-expiry.ts) and is left alone.
 *
 * There is no duration column; the code everywhere assumes MEETING_MINUTES (30). Pure and alias-free so `node --test` runs it.
 */

/** How long a meeting runs: the schedule's "live" half hour and the no-show rule use the same number. */
export const MEETING_MINUTES = 30;

export const INTERVIEW_EXPIRED_REASON = "Time passed, not marked complete";
export const INVITE_EXPIRED_REASON = "Every offered time passed before one was picked";

/** Statuses the sweep may turn into `expired`. Anything else is a decided interview and is never touched. */
export const SWEEPABLE_STATUSES = ["pending", "waiting", "proposed", "scheduled"] as const;
const INVITE_STATUSES = ["pending", "waiting", "proposed"];
const AI_EMPLOYER_ID = "admin";

type When = Date | string | null | undefined;

export type LifecycleInput = {
  status: string | null;
  slot1: When;
  slot2: When;
  slot3: When;
  selectedSlot?: number | null;
  /** Meetings v1: an unpicked offer lapses here (earliest slot - 2 h). Absent on rows from before migration 0043. */
  respondBy?: When;
  employerId?: string | null;
  /** The caller already knows this is the AI interview (the AI employer's email, not only the "admin" id). */
  isAi?: boolean;
};

export type InterviewState = "upcoming" | "live" | "awaiting_pick" | "expired" | "completed" | "missed" | "cancelled" | "declined" | "rescheduled" | "other";

export type InterviewLifecycle = {
  state: InterviewState;
  /** The status to show and filter by: "expired" when it reads expired, else the row's own (lower-cased) status. */
  status: string;
  label: string;
  /** Why it is expired; null otherwise. */
  reason: string | null;
  expired: boolean;
  /** Epoch ms the meeting ends (picked slot + MEETING_MINUTES), or the last offered slot for an invite; null with no slot. */
  endsAt: number | null;
};

function toTime(value: When): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Start of the slot the candidate picked, or null when none was picked (or the picked slot is empty). */
function pickedStart(iv: LifecycleInput): number | null {
  const n = iv.selectedSlot;
  if (!n || n < 1 || n > 3) return null;
  return toTime([iv.slot1, iv.slot2, iv.slot3][n - 1]);
}

const offered = (iv: LifecycleInput): number[] => [iv.slot1, iv.slot2, iv.slot3].map(toTime).filter((t): t is number => t !== null);

const DONE: Record<string, { state: InterviewState; label: string }> = {
  completed: { state: "completed", label: "Completed" },
  missed: { state: "missed", label: "Missed" },
  cancelled: { state: "cancelled", label: "Cancelled" },
  canceled: { state: "cancelled", label: "Cancelled" },
  declined: { state: "declined", label: "Declined" },
  rescheduled: { state: "rescheduled", label: "Rescheduled" },
};

export function interviewLifecycle(iv: LifecycleInput, now: number = Date.now()): InterviewLifecycle {
  const raw = (iv.status ?? "").trim().toLowerCase();
  const picked = pickedStart(iv);
  const slots = offered(iv);
  const endsAt = picked !== null ? picked + MEETING_MINUTES * 60_000 : slots.length ? Math.max(...slots) : null;
  const out = (state: InterviewState, label: string, status = raw, reason: string | null = null): InterviewLifecycle => ({
    state,
    status,
    label,
    reason,
    expired: state === "expired",
    endsAt,
  });

  const done = DONE[raw];
  if (done) return out(done.state, done.label, done.state === "cancelled" ? "cancelled" : raw);

  const isAi = iv.isAi === true || iv.employerId === AI_EMPLOYER_ID;
  const open = raw === "scheduled" || INVITE_STATUSES.includes(raw);
  if (isAi || (!open && raw !== "expired")) return out(raw === "scheduled" ? "upcoming" : INVITE_STATUSES.includes(raw) ? "awaiting_pick" : "other", raw ? raw[0].toUpperCase() + raw.slice(1) : "Unknown");

  const expired = (): InterviewLifecycle => out("expired", "Expired", "expired", picked !== null ? INTERVIEW_EXPIRED_REASON : INVITE_EXPIRED_REASON);
  if (raw === "expired") return expired();

  if (picked !== null) {
    if (now >= picked + MEETING_MINUTES * 60_000) return expired();
    if (raw === "scheduled") return now >= picked ? out("live", "Happening now", "scheduled") : out("upcoming", "Scheduled", "scheduled");
    return out("awaiting_pick", "Waiting on candidate");
  }
  // No usable pick: an invite. Expired once its respond-by passed, or every offered slot has started.
  const by = toTime(iv.respondBy);
  if (by !== null && by <= now && INVITE_STATUSES.includes(raw)) return expired();
  if (slots.length > 0 && slots.every((t) => t < now)) return expired();
  return raw === "scheduled" ? out("upcoming", "Scheduled", "scheduled") : out("awaiting_pick", "Waiting on candidate");
}

/** The sweep's predicate: a still-open row that now reads expired. Same rule the screens use, so they cannot disagree. */
export function interviewExpiredNow(iv: LifecycleInput, now: number = Date.now()): boolean {
  const raw = (iv.status ?? "").trim().toLowerCase();
  return (SWEEPABLE_STATUSES as readonly string[]).includes(raw) && interviewLifecycle(iv, now).expired;
}

/* ── The sweep's notices ─────────────────────────────────────────────────────────────────────────── */

/** An interview that ended longer ago than this is expired quietly: telling anyone about last week's meeting is noise. */
export const NOTICE_WINDOW_MS = 48 * 60 * 60_000;

/** Whether the sweep should tell people: it ended (or its last offered time passed) inside the window. */
export const worthNotice = (endsAt: number | null, now: number): boolean => endsAt !== null && now - endsAt <= NOTICE_WINDOW_MS;

export const interviewNoticeDedupeKey = (interviewId: string, side: "employer" | "intern"): string => `interview_time_passed:${interviewId}:${side}`;

/** At most one notice per side per interview; the dedupe key makes a retry a no-op. `employer` is null when it must not be told. */
export function interviewExpiryNotices(i: { interviewId: string; booked: boolean; initials: string; whenEmployer: string; whenIntern: string; employerTakenDown: boolean; lapsed?: boolean }) {
  const data = { interviewId: i.interviewId, reason: i.booked ? "time_passed_not_completed" : i.lapsed ? "offer_lapsed" : "invite_slots_passed" };
  if (i.lapsed && !i.booked) {
    return {
      employer: i.employerTakenDown
        ? null
        : { title: "Meeting offer lapsed", message: `The times for your meeting with ${i.initials} were not answered in time. Offer new times if you still want to meet.`, data: { ...data, link: "/employer/schedule" } },
      intern: { title: "Meeting offer lapsed", message: "The times for your meeting were not answered in time, so the offer lapsed. Either side can propose new times.", data: { ...data, link: "/intern/interviews" } },
    };
  }
  return {
    employer: i.employerTakenDown
      ? null
      : {
          title: "Interview time passed",
          message: i.booked
            ? `Your interview with ${i.initials} on ${i.whenEmployer} has passed and was not marked complete. Schedule again if you still want to meet.`
            : `${i.initials} did not pick any of the times you offered, and they have all passed. Schedule again with new times.`,
          data: { ...data, link: "/employer/schedule" },
        },
    intern: {
      title: "Interview time passed",
      message: i.booked
        ? `Your interview on ${i.whenIntern} has passed. If it did not happen, the company can schedule it again.`
        : "The times offered for your interview have passed. The company can offer new ones.",
      data: { ...data, link: "/intern/interviews" },
    },
  };
}
