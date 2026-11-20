import type { MatchMethod } from "./review-types.ts";
import { MEETING_MS } from "./slots.ts";

/**
 * Ties a Fireflies transcript to one of our meetings. Pure. Strongest evidence first; anything weaker than these is NOT matched
 * (precision over recall: an unmatched transcript goes to the admin's "Unmatched" bucket, a wrong match would put a stranger's
 * words on someone's account).
 *   1. calendar_event: Fireflies `cal_id` (the calendar provider's event id; Google's "@google.com" suffix removed, recurring
 *      occurrences get "_<date>" appended) equals the Google event id we stored in `interviews.calendar_event_id`.
 *   2. meet_link: the Meet code (abc-defg-hij) of Fireflies `meeting_link` equals the code in our stored `meeting_link`.
 *   3. title_time: Fireflies `title` equals our event title ("Findtern meeting <first 8 of the interview id>") AND the recording
 *      started inside the meeting's window (30 min before the slot to 90 min after its end).
 * Facts about Fireflies' fields are from docs.fireflies.ai/schema/transcript; whether the bot's title/cal_id equals OUR Google event
 * for an attendee-less Meet event is UNVERIFIED until a real recording is seen (see the report).
 */

export type FfMeta = {
  id: string;
  title: string | null;
  calId: string | null;
  meetingLink: string | null;
  startedAt: Date | null;
};

export type MeetingCandidate = {
  interviewId: string;
  calendarEventId: string | null;
  meetingLink: string | null;
  /** The confirmed slot start. */
  slotStart: Date | null;
  /** The title we gave the calendar event. */
  eventTitle: string;
};

const BEFORE_MS = 30 * 60 * 1000;
const AFTER_MS = 90 * 60 * 1000;

const MEET_CODE = /\b([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i;

export const meetCode = (link: string | null | undefined): string | null => (link ? (MEET_CODE.exec(link)?.[1]?.toLowerCase() ?? null) : null);

/** Google's id as Fireflies shows it: no "@google.com", no recurring "_<date>" tail. */
export function normalizeEventId(id: string | null | undefined): string | null {
  if (!id) return null;
  const v = id.trim().replace(/@google\.com$/i, "").replace(/_\d{8}(T\d{6}Z)?$/i, "");
  return v === "" ? null : v.toLowerCase();
}

export type MatchResult =
  | { interviewId: string; method: MatchMethod }
  | { interviewId: null; note: "no_match" | "ambiguous" | "duplicate_meeting" };

export function matchTranscript(meta: FfMeta, candidates: MeetingCandidate[], alreadyHasTranscript: ReadonlySet<string> = new Set()): MatchResult {
  const tiers: { method: MatchMethod; hit: (c: MeetingCandidate) => boolean }[] = [
    { method: "calendar_event", hit: (c) => { const a = normalizeEventId(meta.calId); return a !== null && a === normalizeEventId(c.calendarEventId); } },
    { method: "meet_link", hit: (c) => { const a = meetCode(meta.meetingLink); return a !== null && a === meetCode(c.meetingLink); } },
    {
      method: "title_time",
      hit: (c) => {
        if (!meta.title || !meta.startedAt || !c.slotStart) return false;
        if (meta.title.trim().toLowerCase() !== c.eventTitle.trim().toLowerCase()) return false;
        const t = meta.startedAt.getTime();
        return t >= c.slotStart.getTime() - BEFORE_MS && t <= c.slotStart.getTime() + MEETING_MS + AFTER_MS;
      },
    },
  ];
  for (const tier of tiers) {
    const hits = candidates.filter(tier.hit);
    if (hits.length === 0) continue;
    if (hits.length > 1) return { interviewId: null, note: "ambiguous" };
    const id = hits[0].interviewId;
    // One transcript row per meeting: a second recording of the same meeting (bot left and rejoined) is kept, but unmatched.
    if (alreadyHasTranscript.has(id)) return { interviewId: null, note: "duplicate_meeting" };
    return { interviewId: id, method: tier.method };
  }
  return { interviewId: null, note: "no_match" };
}

export const MATCH_NOTE_TEXT: Record<"no_match" | "ambiguous" | "duplicate_meeting", string> = {
  no_match: "No Findtern meeting has this calendar event, Meet link or title and time.",
  ambiguous: "More than one Findtern meeting fits this recording.",
  duplicate_meeting: "This meeting already has a recording; this is a second one for it.",
};
