import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * The drive a college has open right now (earliest to end), or null. One rule
 * for the heartbeat reply and the page's first paint, so the banner the server
 * renders is the banner the next heartbeat confirms.
 */
export async function liveDriveFor(collegeId: string): Promise<{ id: string; title: string; endsAt: Date } | null> {
  const [drive] = await getDb()
    .select({ id: schema.collegeDrives.id, title: schema.collegeDrives.title, endsAt: schema.collegeDrives.endsAt })
    .from(schema.collegeDrives)
    // A switched-off college announces no drive (QA-201).
    .innerJoin(schema.colleges, and(eq(schema.colleges.id, schema.collegeDrives.collegeId), eq(schema.colleges.isActive, true)))
    .where(
      and(
        eq(schema.collegeDrives.collegeId, collegeId),
        isNull(schema.collegeDrives.revokedAt),
        // timestamp columns hold UTC wall time; a bare now() would read them in the DB session zone.
        lte(schema.collegeDrives.startsAt, sql`(now() AT TIME ZONE 'UTC')`),
        gt(schema.collegeDrives.endsAt, sql`(now() AT TIME ZONE 'UTC')`),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt)
    .limit(1);
  return drive ?? null;
}

/**
 * The same drive, found from a student's id in ONE statement (their open membership's college, which must be an active
 * partner, then its live drive), for the intern layout: it no longer waits for the membership row before it can ask.
 * Null for a student with no open membership or at a non-partner college, like `membershipOf` + `liveDriveFor` gave.
 */
export async function liveDriveForMember(userId: string): Promise<{ id: string; title: string; endsAt: Date } | null> {
  const [drive] = await getDb()
    .select({ id: schema.collegeDrives.id, title: schema.collegeDrives.title, endsAt: schema.collegeDrives.endsAt })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, and(eq(schema.colleges.id, schema.collegeMemberships.collegeId), eq(schema.colleges.isPartner, true), eq(schema.colleges.isActive, true)))
    .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.collegeId, schema.colleges.id))
    .where(
      and(
        eq(schema.collegeMemberships.userId, userId),
        isNull(schema.collegeMemberships.leftAt),
        isNull(schema.collegeDrives.revokedAt),
        lte(schema.collegeDrives.startsAt, sql`(now() AT TIME ZONE 'UTC')`),
        gt(schema.collegeDrives.endsAt, sql`(now() AT TIME ZONE 'UTC')`),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt)
    .limit(1);
  return drive ?? null;
}
