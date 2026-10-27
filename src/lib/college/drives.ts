import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { q } from "./sql";

/** Drives of one college with employer and call counts, newest first. */
export async function drivesOverview(collegeId: string) {
  const d = schema.collegeDrives;
  const id = q(d, d.id);
  return getDb()
    .select({
      drive: d,
      employers: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveEmployers} e WHERE e.drive_id = ${id})`,
      calls: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveMeetings} m WHERE m.drive_id = ${id})`,
      accepted: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveMeetings} m WHERE m.drive_id = ${id} AND m.status = 'accepted')`,
      shortlisted: sql<number>`(SELECT count(DISTINCT s.user_id)::int FROM ${schema.collegeDriveShortlist} s WHERE s.drive_id = ${id})`,
    })
    .from(d)
    .where(eq(d.collegeId, collegeId))
    .orderBy(desc(d.startsAt));
}

/** Employers inside one drive, with how many students each shortlisted and called. */
export async function driveEmployers(driveId: string) {
  const e = schema.collegeDriveEmployers;
  const employerId = q(e, e.employerId);
  return getDb()
    .select({
      employerId: e.employerId,
      joinedAt: e.joinedAt,
      company: schema.employers.companyName,
      shortlisted: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveShortlist} s WHERE s.drive_id = ${driveId} AND s.employer_id = ${employerId})`,
      calls: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveMeetings} m WHERE m.drive_id = ${driveId} AND m.employer_id = ${employerId})`,
    })
    .from(e)
    .leftJoin(schema.employers, eq(schema.employers.id, e.employerId))
    .where(eq(e.driveId, driveId))
    .orderBy(e.joinedAt);
}
