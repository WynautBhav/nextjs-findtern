import { CALL_GRACE_MS, MEETING_MINUTES } from "./constants.ts";

/**
 * What became of one meeting an employer asked a student for: a drive call (college_drive_meetings) or an interview
 * invite (interviews, read through interview-lifecycle.ts by drive-interviews-db.ts). Exactly one outcome per meeting,
 * so the parts always add up to the total. Every college screen that counts meetings (dashboard, Master data, drive
 * board, drive summary, drives list, student page) counts these, so the same meetings give the same numbers everywhere.
 *
 * Owner rule, 27 Nov 2026: Completed only when the employer and the student met; Expired when it was not accepted, not
 * joined, or its time passed. So the outcomes fall into five stages (MEET_STAGE):
 *
 *   sent       waiting      asked, the student has not answered, still answerable (nudge: answer it)
 *   accepted   booked       the student said yes / picked a time, and that time has not ended (nudge: turn up)
 *   completed  conducted    an interview the company marked completed (it sends the feedback form) after the meeting
 *   expired    not_accepted the student declined, or nobody answered in time
 *              missed       the company marked the student a no-show
 *              not_joined   an accepted drive call whose time passed: calls keep no record that both sides joined
 *              not_closed   an interview whose picked time passed and the company never marked it
 *   withdrawn  withdrawn    the company (or Findtern) called it off
 *              called_off   the student called it off
 */
export const MEET_OUTCOMES = ["waiting", "booked", "conducted", "missed", "not_joined", "not_closed", "not_accepted", "withdrawn", "called_off"] as const;
export type MeetOutcome = (typeof MEET_OUTCOMES)[number];

export const MEET_STAGES = ["sent", "accepted", "completed", "expired", "withdrawn"] as const;
export type MeetStage = (typeof MEET_STAGES)[number];
export const MEET_STAGE: Record<MeetOutcome, MeetStage> = {
  waiting: "sent",
  booked: "accepted",
  conducted: "completed",
  missed: "expired",
  not_joined: "expired",
  not_closed: "expired",
  not_accepted: "expired",
  withdrawn: "withdrawn",
  called_off: "withdrawn",
};
/** The one wording of each stage, on every screen. */
export const MEET_STAGE_LABEL: Record<MeetStage, string> = { sent: "Sent", accepted: "Accepted", completed: "Completed", expired: "Expired", withdrawn: "Withdrawn" };

/** The one wording of each outcome (a list's "what happened" line), on every screen. */
export const MEET_LABEL: Record<MeetOutcome, string> = {
  waiting: "Sent, waiting for the student",
  booked: "Accepted",
  conducted: "Completed",
  missed: "Expired · the student didn't join",
  not_joined: "Expired · no record both joined",
  not_closed: "Expired · time passed, not marked",
  not_accepted: "Expired · not accepted",
  withdrawn: "Withdrawn by the company",
  called_off: "Withdrawn by the student",
};

/**
 * A meeting in the drive-call vocabulary (requested | accepted | completed | missed | declined | rejected | expired |
 * cancelled), plus `unmarked`: an interview whose picked time passed with no outcome marked (drive-interviews-db.ts).
 * `startsAt` is the call's start or the interview's picked time.
 */
export type MeetLike = { status: string; startsAt?: Date | null; cancelledBy?: string | null };

/** Which stage a meeting is in. */
export const meetStage = (m: MeetLike, now: number): MeetStage => MEET_STAGE[meetOutcome(m, now)];

export function meetOutcome(m: MeetLike, now: number): MeetOutcome {
  const start = m.startsAt ? m.startsAt.getTime() : null;
  switch (m.status) {
    case "cancelled":
      return m.cancelledBy === "intern" ? "called_off" : "withdrawn";
    case "completed":
      return "conducted";
    case "missed":
      return "missed";
    case "declined":
    case "rejected":
      return "not_accepted";
    case "expired":
      // Nobody answered in time (a call, or an invite nobody picked a time for).
      return "not_accepted";
    case "unmarked":
      // A picked interview time passed and the company never marked it completed or missed.
      return "not_closed";
    case "requested":
      return start !== null && start + CALL_GRACE_MS < now ? "not_accepted" : "waiting";
    case "accepted":
      // Only an interview the company marks completed is a meeting that happened; a call keeps no join record.
      return start !== null && start + MEETING_MINUTES * 60_000 <= now ? "not_joined" : "booked";
    default:
      return "waiting";
  }
}

/**
 * An interview, read through interview-lifecycle.ts, in the meet vocabulary above; null for a rescheduled invite (it was
 * replaced by a new one, which is the meet). The one mapping: the drive loaders and the student page both use it.
 */
export function interviewMeetStatus(state: string, picked: boolean): string | null {
  if (state === "rescheduled") return null;
  if (state === "upcoming" || state === "live") return "accepted";
  if (state === "awaiting_pick") return "requested";
  // A picked time that passed with nothing marked is not a lapsed invite: the company has yet to close it.
  if (state === "expired") return picked ? "unmarked" : "expired";
  if (state === "completed" || state === "missed" || state === "declined") return state;
  return "cancelled";
}

export type MeetTally = { total: number; students: number } & Record<MeetStage, number>;

/** Meetings counted one by one per stage, and the students they cover. */
export function tallyMeets(meets: (MeetLike & { userId: string })[], now: number): MeetTally {
  const t = { total: meets.length, students: new Set(meets.map((m) => m.userId)).size } as MeetTally;
  for (const o of MEET_STAGES) t[o] = 0;
  for (const m of meets) t[meetStage(m, now)]++;
  return t;
}
