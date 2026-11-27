import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { q } from "./sql";
import { compareDrives } from "./access";

/** Drives of one college with employer and shortlist counts (meets: drive-board-db.ts driveMeetCounts): live, then upcoming, then past (compareDrives). */
export async function drivesOverview(collegeId: string) {
  const d = schema.collegeDrives;
  const id = q(d, d.id);
  const rows = await getDb()
    .select({
      drive: d,
      employers: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveEmployers} e WHERE e.drive_id = ${id})`,
    })
    .from(d)
    .where(eq(d.collegeId, collegeId))
    .orderBy(desc(d.startsAt));
  const now = Date.now();
  return rows.sort((a, b) => compareDrives(a.drive, b.drive, now));
}
