import { NextResponse } from "next/server";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { requireMutation } from "@/lib/guards-mutation";
import { meetingsForStudent } from "@/lib/college/meetings";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Student presence, every 30 s while a Findtern tab is open. The reply
 * carries the live drive (for the banner) and any call requests, so the
 * student's page needs no second poll and no open stream.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
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

  const [drive] = await db
    .select({ id: schema.collegeDrives.id, title: schema.collegeDrives.title, endsAt: schema.collegeDrives.endsAt })
    .from(schema.collegeDrives)
    // A switched-off college announces no drive (QA-201).
    .innerJoin(schema.colleges, and(eq(schema.colleges.id, schema.collegeDrives.collegeId), eq(schema.colleges.isActive, true)))
    .where(
      and(
        eq(schema.collegeDrives.collegeId, m.collegeId),
        isNull(schema.collegeDrives.revokedAt),
        lte(schema.collegeDrives.startsAt, sql`now()`),
        gt(schema.collegeDrives.endsAt, sql`now()`),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt)
    .limit(1);

  return NextResponse.json(
    { college: m.collegeId, drive: drive ?? null, meetings: await meetingsForStudent(uid) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
