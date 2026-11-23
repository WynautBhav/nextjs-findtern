import { sql, type SQL } from "drizzle-orm";

import { timePassed } from "../interview-time-sql.ts";
import { startBegunSql } from "../offer-start-sql.ts";

/**
 * The college portal's offer and meeting counts, written once so every count reads the same rule as the intern, employer and
 * admin views (and the list it opens). SQL twins of: offerPastStart / internOfferKey (offers), interviewLifecycle (meetings).
 * All take the table alias the caller's subquery uses. Pure SQL fragments, no database: the node tests render them.
 */

/** Stored statuses where the student said yes (internOfferKey: `processing` is an accepted offer whose payment is under way). */
export const ACCEPTED_OFFER_STATUSES = ["accepted", "processing", "hired", "completed"] as const;
export const acceptedStatusesSql = (): SQL => sql.join(ACCEPTED_OFFER_STATUSES.map((s) => sql`${s}`), sql`, `);

const col = (alias: string, c: string) => sql.raw(`${alias}.${c}`);

/**
 * Accepted, not hired, its start day begun, and no payment order open for it in the last 30 minutes: the employer did not
 * pay in time, so it expired (proposal-expiry.ts acceptedUnpaidExpired, "Expired · not paid before start" for the employer,
 * "Expired" for the intern). Until the sweep stores it, its status still reads `accepted`, so counts must exclude it here.
 */
export function offerUnpaidExpiredSql(alias: string, today: string): SQL {
  return sql`(${col(alias, "status")} = 'accepted' AND ${col(alias, "hired_at")} IS NULL AND ${startBegunSql(col(alias, "offer_details"), today)}
    AND NOT EXISTS (SELECT 1 FROM employer_payments ep WHERE ep.employer_id = ${col(alias, "employer_id")} AND ep.status = 'created'
      AND ep.created_at >= (now() AT TIME ZONE 'UTC') - interval '30 minutes' AND ep.raw->'notes'->'proposalIds' ? ${col(alias, "id")}))`;
}

/** Unanswered and its start day has begun (IST), or already stored as a no-reply expiry: the intern's "lapsed". */
export function offerLapsedSql(alias: string, today: string): SQL {
  return sql`((${col(alias, "status")} IN ('sent', 'interview_scheduled') AND ${col(alias, "hired_at")} IS NULL AND ${startBegunSql(col(alias, "offer_details"), today)})
    OR (${col(alias, "status")} = 'expired' AND ${col(alias, "offer_details")}->>'expiredReason' = 'no_reply_past_start'))`;
}

/** Still waiting on the student: sent, and the start day has not begun. */
export function offerWaitingSql(alias: string, today: string): SQL {
  return sql`(${col(alias, "status")} = 'sent' AND ${col(alias, "hired_at")} IS NULL AND NOT ${startBegunSql(col(alias, "offer_details"), today)})`;
}

/** Open (not answered, not closed): sent or interview booked, and the start day has not begun. */
export function offerOpenSql(alias: string, today: string): SQL {
  return sql`(${col(alias, "status")} IN ('sent', 'interview_scheduled') AND NOT ${startBegunSql(col(alias, "offer_details"), today)})`;
}

/** A booked interview still ahead or running (interviewLifecycle "upcoming" / "live"). */
export function interviewUpcomingSql(alias: string, nowIso: string): SQL {
  return sql`(${col(alias, "status")} = 'scheduled' AND NOT ${timePassed(alias, nowIso)})`;
}

/** Times offered, no answer yet, and a slot is still ahead (interviewLifecycle "awaiting_pick"). */
export function interviewWaitingSql(alias: string, nowIso: string): SQL {
  return sql`(${col(alias, "status")} = 'pending' AND NOT ${timePassed(alias, nowIso)})`;
}

/** Stored `expired`, or still open but its time passed (interviewLifecycle "expired"). */
export function interviewExpiredSql(alias: string, nowIso: string): SQL {
  return sql`(${col(alias, "status")} = 'expired' OR (${col(alias, "status")} IN ('pending', 'waiting', 'proposed', 'scheduled') AND ${timePassed(alias, nowIso)}))`;
}

/**
 * "On your list" on the dashboard funnel: every roster row (leavers already dropped) PLUS each verified student who is not matched
 * to a roster row (joined by a code, not on the uploaded list). Not max(roster, verified), which is one short for each such student
 * and so does not add up with the "Not joined yet" tile (FN-04). Emails match case-insensitively, as the roster join does.
 */
export function onYourListCount(rosterEmails: readonly string[], verifiedStudentEmails: readonly string[]): number {
  const onRoster = new Set(rosterEmails.map((e) => e.toLowerCase()));
  const unmatched = new Set(verifiedStudentEmails.map((e) => e.toLowerCase()).filter((e) => !onRoster.has(e)));
  return onRoster.size + unmatched.size;
}
