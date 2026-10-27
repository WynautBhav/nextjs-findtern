import { and, desc, eq, inArray, isNotNull, or, type SQL } from "drizzle-orm";

import { getSession } from "./auth";
import { getDb } from "./db";
import { proposals } from "./db/schema";
import { isHiredProposal } from "./hire-status";
import { parseOffer } from "./offer";

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
};

const LIVE_STATUSES = ["sent", "interview_scheduled", "accepted", "processing"];
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

  for (const id of ids) {
    const mine = rows.filter((r) => r.internId === id);
    const withOffer = mine.map((r) => ({ ...r, fullTime: Boolean(parseOffer(r.offerDetails, r.currency).fullTime) }));
    const hires = withOffer.filter((r) => isHiredProposal(r));
    const live = withOffer.find((r) => LIVE_STATUSES.includes((r.status ?? "").toLowerCase()) && !isHiredProposal(r));
    const shown = live ?? hires[0] ?? null;
    const internship = hires.find((r) => !r.fullTime);
    const fullTimeOut = withOffer.some((r) => r.fullTime && !CLOSED_STATUSES.includes((r.status ?? "").toLowerCase()));
    out.set(id, {
      proposal: shown ? { id: shown.id, status: isHiredProposal(shown) ? "hired" : shown.status, fullTime: shown.fullTime } : null,
      hired: hires.length > 0,
      fullTimeFrom: internship && !fullTimeOut ? internship.id : null,
    });
  }
  return out;
}
