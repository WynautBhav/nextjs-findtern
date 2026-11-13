import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { requireMutation } from "@/lib/guards-mutation";
import { liveDriveFor } from "@/lib/college/live-drive";
import { meetingsForStudent } from "@/lib/college/meetings";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Student presence, every 30 s while a Findtern tab is open. The reply
 * carries the live drive (for the banner) and any call requests, so the
 * student's page needs no second poll and no open stream.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"], allowPendingTerms: true });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const db = getDb();

  const [m] = await db
    .select({ collegeId: schema.collegeMemberships.collegeId })
    .from(schema.collegeMemberships)
    .where(and(eq(schema.collegeMemberships.userId, uid), isNull(schema.collegeMemberships.leftAt)))
    .limit(1);
  if (!m) return NextResponse.json({ college: null, drive: null, meetings: [] });

  await db
    .insert(schema.collegePresence)
    .values({ userId: uid, collegeId: m.collegeId, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({ target: schema.collegePresence.userId, set: { lastSeenAt: sql`now()`, collegeId: m.collegeId } });

  const drive = await liveDriveFor(m.collegeId);

  return NextResponse.json(
    { college: m.collegeId, drive, meetings: await meetingsForStudent(uid) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
