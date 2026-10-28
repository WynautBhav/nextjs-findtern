import { eq } from "drizzle-orm";

import type { getDb } from "../db/index.ts";
import { collegeDriveEmployers, collegeDrives } from "../db/schema.ts";

/**
 * Issue a new link for a drive, in one transaction: the new token hash, the
 * drive reopened if it was revoked, and every employer's joined row deleted
 * (QA-200).
 *
 * The joined row is an employer's pass once they have opened the link, so
 * keeping the rows made a new link pointless against a leaked one: whoever
 * joined through the old link stayed inside, before or after a revoke.
 * Employers the college still wants in open the new link and are back, with
 * their shortlist and call requests intact: those rows are keyed on
 * (drive, employer), not on the joined row, so they wait for the rejoin.
 *
 * Deleting rather than comparing joinedAt with the reissue time: every
 * reader of the joined rows (access, the officer's employer list and counts)
 * is then right with no extra condition, and no column is added.
 */
export async function reissueDriveLink(
  db: Pick<ReturnType<typeof getDb>, "transaction">,
  driveId: string,
  tokenHash: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(collegeDrives).set({ tokenHash, revokedAt: null, updatedAt: now }).where(eq(collegeDrives.id, driveId));
    await tx.delete(collegeDriveEmployers).where(eq(collegeDriveEmployers.driveId, driveId));
  });
}
