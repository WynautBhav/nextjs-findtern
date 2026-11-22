import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { firstEligibleDrive } from "./eligibility";
import { memberOf } from "./scope";

/**
 * The drive banner for a student: the earliest-ending drive of their college that is open right now AND that they may
 * enter (the same eligibility the drive's employers see them by), or null. One rule for the intern layout's first paint
 * and the heartbeat reply, so the banner the server renders is the banner the next heartbeat confirms. Null for a
 * student with no open membership, at a non-partner or switched-off college (QA-201), or eligible for no live drive.
 */
export async function liveDriveForMember(userId: string): Promise<{ id: string; title: string; endsAt: Date } | null> {
  const live = await getDb()
    .select({
      id: schema.collegeDrives.id,
      title: schema.collegeDrives.title,
      endsAt: schema.collegeDrives.endsAt,
      collegeId: schema.collegeDrives.collegeId,
      kind: schema.collegeDrives.kind,
      eligibility: schema.collegeDrives.eligibility,
      includeUserIds: schema.collegeDrives.includeUserIds,
      excludeUserIds: schema.collegeDrives.excludeUserIds,
    })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, and(eq(schema.colleges.id, schema.collegeMemberships.collegeId), eq(schema.colleges.isPartner, true), eq(schema.colleges.isActive, true)))
    .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.collegeId, schema.colleges.id))
    .where(
      and(
        eq(schema.collegeMemberships.userId, userId),
        isNull(schema.collegeMemberships.leftAt),
        isNull(schema.collegeDrives.revokedAt),
        // timestamp columns hold UTC wall time; a bare now() would read them in the DB session zone.
        lte(schema.collegeDrives.startsAt, sql`(now() AT TIME ZONE 'UTC')`),
        gt(schema.collegeDrives.endsAt, sql`(now() AT TIME ZONE 'UTC')`),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt);
  if (live.length === 0) return null;
  const member = await memberOf(live[0].collegeId, userId);
  const drive = member ? firstEligibleDrive(live, member) : null;
  return drive ? { id: drive.id, title: drive.title, endsAt: drive.endsAt } : null;
}
