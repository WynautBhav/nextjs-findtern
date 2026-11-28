/**
 * Heat on the Meetings view: which open meetings an admin should chase first. A meeting is open while it waits for the
 * student's reply (stage `sent`) or is booked and still to come (`accepted`); every other stage is closed and has no
 * heat. The points come from WEIGHTS only, and MEETING_HEAT_GUIDE (the "What heat means" text) is built from the same
 * constants, so the explanation can never disagree with the score. Pure, so `node --test` runs it.
 *
 * Statuses are never re-derived: the stage comes from meeting-stage.ts (interviewLifecycle -> meetOutcome) and "no
 * link" is needsMeetingLink.
 */
import { inviteLapse } from "../interview-lifecycle.ts";
import { heatOf, type Heat, type HeatGuide } from "./heat.ts";
import { needsMeetingLink, type MeetingRow } from "./meeting-stage.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const WEIGHTS = {
  /** Booked, still to come, and no link saved: nobody can join until an admin adds one. */
  noLink: 40,
  /** Booked meeting starts within 24 hours (or has just started). */
  startsWithin24h: 30,
  /** Booked meeting starts in 1 to 3 days. */
  startsWithin3d: 15,
  /** Waiting for the student: the reply is due within 24 hours. */
  replyDueWithin24h: 40,
  /** Waiting for the student: the reply is due in 1 to 3 days. */
  replyDueWithin3d: 15,
  /** Waiting for the student: points for each full day since the request was sent. */
  perDayWaiting: 5,
  /** The most the days-waiting points can add. */
  maxDaysWaiting: 30,
  /** A full-time role: a placement, and a bigger fee, depend on this meeting. */
  fullTime: 10,
} as const;

type HeatInput = Pick<MeetingRow, "kind" | "stage" | "status" | "proposedBy" | "startsAt" | "meetingLink" | "respondBy" | "slots" | "createdAt" | "track">;

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** "5 h" under two days, else "3 days". */
function span(msLeft: number): string {
  const h = Math.max(0, Math.round(msLeft / HOUR));
  if (h < 48) return `${h} h`;
  const d = Math.round(msLeft / DAY);
  return `${d} days`;
}

/**
 * When an unanswered request lapses. An interview: interviewLifecycle's own rule (inviteLapse), the earlier of its
 * respond-by and its last offered slot. A drive call: its start (meetOutcome then gives it 10 minutes more).
 */
function replyDue(r: HeatInput): number | null {
  if (r.kind === "call") return ms(r.startsAt);
  const [slot1, slot2, slot3] = r.slots;
  return inviteLapse({ status: r.status, slot1: slot1 ?? null, slot2: slot2 ?? null, slot3: slot3 ?? null, respondBy: r.respondBy }).at;
}

/** Who owes the reply: the company when the student proposed the times, else the student. */
const owes = (r: HeatInput) => (r.proposedBy === "intern" ? "the company" : "the student");

/** The row's heat, or null when the meeting is closed (completed, expired, withdrawn). */
export function meetingHeat(r: HeatInput, now: number): Heat | null {
  const W = WEIGHTS;
  const why: string[] = [];
  let score = 0;

  if (r.stage === "accepted") {
    if (needsMeetingLink(r)) {
      score += W.noLink;
      why.push("No meeting link");
    }
    const start = ms(r.startsAt);
    if (start !== null) {
      const left = start - now;
      if (left <= DAY) {
        score += W.startsWithin24h;
        why.push(left <= 0 ? "Started" : `Starts in ${span(left)}`);
      } else if (left <= 3 * DAY) {
        score += W.startsWithin3d;
        why.push(`Starts in ${span(left)}`);
      } else why.push(`Starts in ${span(left)}`);
    } else why.push("Booked, no time picked");
  } else if (r.stage === "sent") {
    const due = replyDue(r);
    if (due !== null) {
      const left = due - now;
      if (left <= DAY) {
        score += W.replyDueWithin24h;
        why.push(`Reply due in ${span(left)}`);
      } else if (left <= 3 * DAY) {
        score += W.replyDueWithin3d;
        why.push(`Reply due in ${span(left)}`);
      }
    }
    const created = ms(r.createdAt);
    const days = created === null ? 0 : Math.floor((now - created) / DAY);
    if (days > 0) {
      score += Math.min(W.maxDaysWaiting, days * W.perDayWaiting);
      why.push(`Waiting ${days} ${days === 1 ? "day" : "days"} for ${owes(r)}`);
    } else why.push("Sent today");
  } else return null;

  if (r.track === "full_time") {
    score += W.fullTime;
    why.push("Full-time role");
  }
  return heatOf(score, why);
}

/** "What heat means" for the Meetings view, written from WEIGHTS. */
export const MEETING_HEAT_GUIDE: HeatGuide = {
  measures:
    "Heat tells you which meetings to chase first. A meeting gets hot when it could fall through soon: it has no link and starts shortly, or nobody has replied and the reply is nearly due.",
  factors: [
    { label: "Booked, and no meeting link saved", points: `+${WEIGHTS.noLink}` },
    { label: "Booked, starts within 24 hours", points: `+${WEIGHTS.startsWithin24h}` },
    { label: "Booked, starts in 1 to 3 days", points: `+${WEIGHTS.startsWithin3d}` },
    {
      label: "Waiting for a reply (the student, or the company when the student proposed times), due within 24 hours. The reply is due at the reply-by date or when the last offered time starts, whichever is first",
      points: `+${WEIGHTS.replyDueWithin24h}`,
    },
    { label: "Waiting for a reply, due in 1 to 3 days", points: `+${WEIGHTS.replyDueWithin3d}` },
    {
      label: "Waiting for a reply, for each day since it was sent. An old request with no offered times and no reply-by date gets only these points",
      points: `+${WEIGHTS.perDayWaiting} a day, up to +${WEIGHTS.maxDaysWaiting}`,
    },
    { label: "Full-time role", points: `+${WEIGHTS.fullTime}` },
  ],
  noHeat: "completed, expired (including declined) and withdrawn meetings. They are closed and show a dash.",
  action: "For a hot row, open View. Add the link if it is missing. If the student has not replied, call or nudge them before the reply is due.",
};
