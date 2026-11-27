import { eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { loadDrivePool } from "./drive-board-db";
import { isStudentEligible } from "./access";
import { buildCompanies, type CompanyRow, type DriveFacts, type InviteContact } from "./companies";
import { loadDriveEmployers } from "./drive-employers-db";
import { studentsForCollegeAdmin, type CollegeContext } from "./scope";

/**
 * Master data's Companies view: every company that came to, or was invited to, a drive of THIS college. It starts from the college's
 * own drives and reads each drive's companies (the same reads as the drive's Employers panel), so no other college's company can
 * reach it. Contact details are what that panel already shows this officer.
 */
export async function companiesForCollege(ctx: CollegeContext): Promise<CompanyRow[]> {
  const db = getDb();
  const [drives, students] = await Promise.all([
    db.select().from(schema.collegeDrives).where(eq(schema.collegeDrives.collegeId, ctx.college.id)),
    studentsForCollegeAdmin(ctx),
  ]);
  if (!drives.length) return [];
  const verified = students.filter((s) => s.status === "verified");

  const facts: DriveFacts[] = await Promise.all(
    drives.map(async (drive) => {
      const invited = (drive.invitedEmployers ?? []) as InviteContact[];
      const ids = verified.filter((s) => isStudentEligible(s, drive)).map((s) => s.userId);
      // The drive's one pool, as its own page reads it. open = false: only the counts are wanted; presence is read once below.
      const pool = await loadDrivePool(drive, ids);
      const came = pool.came;
      const loaded = await loadDriveEmployers(drive, pool, invited, false);
      const counts = new Map(loaded.rows.flatMap((r) => (r.employerId ? [[r.employerId, { meetings: r.meetings, offers: r.offers, hires: r.hires }] as const] : [])));
      return { driveId: drive.id, startsAt: drive.startsAt, came, invited, counts };
    }),
  );

  const employerIds = [...new Set(facts.flatMap((f) => f.came.map((c) => c.employerId)))];
  const presence = employerIds.length
    ? await db
        .select({ userId: schema.userPresence.userId, lastSeenAt: sql<Date>`(${schema.userPresence.lastSeenAt} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v)) })
        .from(schema.userPresence)
        .where(inArray(schema.userPresence.userId, employerIds))
    : [];
  return buildCompanies(facts, new Map(presence.map((p) => [p.userId, p.lastSeenAt])));
}
