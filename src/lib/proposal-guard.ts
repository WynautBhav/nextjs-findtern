/**
 * The "send the offer after the interview" rule.
 *
 * A meeting that is booked (or has slots offered) and not over yet holds the
 * candidate: the proposals route refuses an offer until its time has run out.
 * These two functions let the screens say so up front instead of after a
 * failed click. Kept free of the `@/` alias so `node --test` can run it.
 */

import { isBlockingInterview, meetingTime } from "./employer-interview-rules.ts";
import { shortDate } from "./format.ts";

type InterviewLike = Parameters<typeof isBlockingInterview>[0] & { projectId?: string | null };

/**
 * When the pending meeting with a candidate is (ISO), or null. Only meetings
 * that still block count; with several, the soonest. A meeting tied to another
 * project does not hold an offer on this one (same scoping as the proposals route).
 */
export function pendingMeetingAtFor(
  interviews: InterviewLike[],
  options: { projectId?: string | null; now?: number } = {},
): string | null {
  const now = options.now ?? Date.now();
  const times = interviews
    .filter((iv) => !options.projectId || !iv.projectId || iv.projectId === options.projectId)
    .filter((iv) => isBlockingInterview(iv, now))
    .map((iv) => meetingTime(iv))
    .filter((t): t is number => t !== null);
  return times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
}

export const SEND_AFTER_INTERVIEW = "Send the offer after the interview";

/** What replaces "Send proposal" while a meeting is pending; null when it is free to send. */
export function sendProposalHold(pendingMeetingAt: string | null | undefined): { label: string; reason: string } | null {
  if (!pendingMeetingAt) return null;
  const at = new Date(pendingMeetingAt);
  if (Number.isNaN(at.getTime())) return null;
  return { label: `Meeting on ${shortDate(at, { day: "numeric", month: "short" })}`, reason: SEND_AFTER_INTERVIEW };
}
