import { and, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";

import { getSession } from "./auth";
import { getDb } from "./db";
import { interviews, proposals, users } from "./db/schema";
import { isHiredProposal } from "./hire-status";
import { parseOffer, todayIst } from "./offer";
import { LIVE_STATUSES } from "./employer-offer-status";
import { EXPIRY_LABEL, expiryOf, type ExpiryReason } from "./proposal-expiry";
import { pendingMeetingAtFor } from "./proposal-guard";

export { isLiveOffer } from "./employer-offer-status";

/** True when an admin is browsing this account through "View as". */
export async function isAdminViewing(): Promise<boolean> {
  try {
    return Boolean((await getSession())?.impersonator);
  } catch {
    return false;
  }
}

/**
 * Every id is "hired" for redaction purposes. Returned while an admin is
 * viewing as the employer, so each screen that unmasks through `.has()`
 * shows full names without its own admin branch.
 */
class EveryoneUnlocked extends Set<string> {
  override has(): boolean {
    return true;
  }
}

/**
 * Intern ids this employer has hired (any project). Feed the result into
 * `displayNameOf` (lib/employer-candidates) so every employer screen unmasks
 * the same people: initials everywhere, full name only after hire.
 *
 * Split out of `employer-candidates` so that module stays import-free and
 * unit-testable under plain `node --test` (no `@/` alias there).
 *
 * During an admin "View as" everyone is unmasked (see `EveryoneUnlocked`).
 */
export async function hiredInternIds(
  db: ReturnType<typeof getDb>,
  employerId: string,
): Promise<Set<string>> {
  if (await isAdminViewing()) return new EveryoneUnlocked();
  const rows = await db
    .select({ internId: proposals.internId })
    .from(proposals)
    .where(and(eq(proposals.employerId, employerId), hiredProposalSql()));
  return new Set(rows.map((row) => row.internId));
}

/**
 * WHERE clause for a query on `users`: this employer has not hired the intern
 * on any project. The Candidates list leaves hired interns out (they are in
 * Hired / Orders). Real hires only, never `hiredInternIds`, which is everyone
 * under an admin "View as".
 */
export function notHiredByEmployerSql(employerId: string): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${proposals} WHERE ${proposals.employerId} = ${employerId} AND ${proposals.internId} = ${users.id} AND (${hiredProposalSql()}))`;
}

/**
 * SQL twin of lib/candidate-hold.ts (read its header for the rule): the intern is held by ANOTHER employer's accepted-unpaid
 * or processing offer, or by that employer's running/upcoming hire. For a query on `users`; the employer's own offers and
 * hires are left to the existing per-employer rules. Every cast sits behind a regex CASE, so a stray value never fails the
 * whole query. `now` is only for tests.
 */
export function heldElsewhereSql(employerId: string, now: Date = new Date()): SQL {
  const today = todayIst(now);
  const sd = sql.raw("btrim(hp.offer_details->>'startDate')");
  const realDay = sql`(left(${sd}, 10) ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')`;
  // coalesce: a missing start day is NULL, and NOT NULL would drop the row instead of holding the intern.
  const looseDay = sql`coalesce(left(${sd}, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', false)`;
  const months = sql`least(greatest(coalesce(substring(btrim(hp.offer_details->>'duration') from '^([0-9]{1,3})[[:space:]]*[mM]')::int, 1), 1), 999)`;
  const startDay = sql`make_date(left(${sd}, 4)::int, substr(${sd}, 6, 2)::int, 1) + (substr(${sd}, 9, 2)::int - 1)`;
  // Running: full-time, or no real start day, or today is before start + months. Nested CASEs: AND does not order evaluation, and the casts must not run on a bad value.
  const running = sql`(jsonb_typeof(hp.offer_details->'fullTimeOffer') = 'object' OR CASE WHEN ${realDay} THEN (CASE WHEN date_trunc('month', ${startDay}) = make_date(left(${sd}, 4)::int, substr(${sd}, 6, 2)::int, 1) THEN (${startDay} + ${months} * interval '1 month')::date > ${today}::date ELSE true END) ELSE true END)`;
  return sql`EXISTS (SELECT 1 FROM proposals hp WHERE hp.intern_id = ${users.id} AND hp.employer_id <> ${employerId} AND (
    (hp.hired_at IS NULL AND hp.status = 'processing')
    OR (hp.hired_at IS NULL AND hp.status = 'accepted' AND NOT (${looseDay} AND left(${sd}, 10) <= ${today}))
    OR ((hp.status = 'hired' OR hp.hired_at IS NOT NULL) AND hp.ended_at IS NULL AND ${running})))`;
}

/** Of `internIds`, the ones this employer has really hired (same rule as `notHiredByEmployerSql`). */
export async function hiredAmong(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ internId: proposals.internId })
    .from(proposals)
    .where(and(eq(proposals.employerId, employerId), inArray(proposals.internId, ids), hiredProposalSql()));
  return new Set(rows.map((row) => row.internId));
}

/** SQL twin of `isHiredProposal` (lib/hire-status): status hired, or hiredAt set. */
export function hiredProposalSql(): SQL {
  return or(eq(proposals.status, "hired"), isNotNull(proposals.hiredAt))!;
}

/** Where one candidate stands with this employer, across every project. */
export type CandidateRelation = {
  /**
   * The offer to show on the candidate: the newest live one (sent, booked,
   * accepted, processing), else the hire. Null when there is none.
   */
  proposal: { id: string; status: string; fullTime: boolean } | null;
  /** Hired by this employer on any project (EMB-26: locked everywhere). */
  hired: boolean;
  /** The internship hire a full-time offer would follow from, if offerable (EMH-42). */
  fullTimeFrom: string | null;
  /**
   * When this employer's booked (or offered) meeting with them is, as an ISO
   * string, while it still holds the candidate; null otherwise. A date only:
   * no link, notes or slots leave the server. Screens use it to hold
   * "Send proposal" until the interview is over (lib/proposal-guard).
   */
  pendingMeetingAt: string | null;
  /**
   * The newest expired offer (no reply, unpaid or closed by Findtern), only while nothing live or hired shows. The card keeps
   * its history ("Expired") instead of reading as never contacted; "Send proposal" stays open for a new offer.
   */
  expired: { id: string; reason: ExpiryReason; label: string } | null;
};

const CLOSED_STATUSES = ["rejected", "withdrawn", "expired"];

/**
 * One query for a page of candidates: their live or hired offers from this
 * employer, folded into what the card, table, compare and profile show.
 * Deliberately not `hiredInternIds`, which reports everyone as hired under an
 * admin "View as".
 */
export async function candidateRelations(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internIds: string[],
  /** The project an offer would be for: a meeting tied to another project does not hold it. */
  projectId?: string | null,
): Promise<Map<string, CandidateRelation>> {
  const out = new Map<string, CandidateRelation>();
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: proposals.id,
      internId: proposals.internId,
      status: proposals.status,
      hiredAt: proposals.hiredAt,
      offerDetails: proposals.offerDetails,
      currency: proposals.currency,
    })
    .from(proposals)
    .where(and(eq(proposals.employerId, employerId), inArray(proposals.internId, ids)))
    .orderBy(desc(proposals.createdAt));
  const meetings = await db
    .select()
    .from(interviews)
    .where(and(eq(interviews.employerId, employerId), inArray(interviews.internId, ids), inArray(interviews.status, ["pending", "scheduled"])));

  for (const id of ids) {
    const mine = rows.filter((r) => r.internId === id);
    const withOffer = mine.map((r) => ({ ...r, fullTime: Boolean(parseOffer(r.offerDetails, r.currency).fullTime) }));
    const hires = withOffer.filter((r) => isHiredProposal(r));
    const expiry = (r: (typeof withOffer)[number]) => expiryOf({ status: r.status, hiredAt: r.hiredAt, offerDetails: r.offerDetails, currency: r.currency });
    // A sent or accepted offer whose start day passed is expired even before the sweeper stores it.
    const live = withOffer.find((r) => LIVE_STATUSES.includes((r.status ?? "").toLowerCase()) && !isHiredProposal(r) && !expiry(r).expired);
    const lapsedRow = live || hires.length > 0 ? null : withOffer.find((r) => !isHiredProposal(r) && ["no_reply_past_start", "unpaid_past_start", "admin_closed"].includes(expiry(r).reason ?? ""));
    const lapsedReason = lapsedRow ? expiry(lapsedRow).reason : null;
    const shown = live ?? hires[0] ?? null;
    const internship = hires.find((r) => !r.fullTime);
    const fullTimeOut = withOffer.some((r) => r.fullTime && !CLOSED_STATUSES.includes((r.status ?? "").toLowerCase()));
    out.set(id, {
      proposal: shown ? { id: shown.id, status: isHiredProposal(shown) ? "hired" : shown.status, fullTime: shown.fullTime } : null,
      hired: hires.length > 0,
      fullTimeFrom: internship && !fullTimeOut ? internship.id : null,
      expired: lapsedRow && lapsedReason ? { id: lapsedRow.id, reason: lapsedReason, label: EXPIRY_LABEL[lapsedReason] } : null,
      pendingMeetingAt: pendingMeetingAtFor(
        meetings.filter((m) => m.internId === id),
        { projectId },
      ),
    });
  }
  return out;
}
