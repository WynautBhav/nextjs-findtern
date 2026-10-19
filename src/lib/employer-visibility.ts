import { and, eq, isNotNull, or, type SQL } from "drizzle-orm";

import { getSession } from "./auth";
import { getDb } from "./db";
import { proposals } from "./db/schema";

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
