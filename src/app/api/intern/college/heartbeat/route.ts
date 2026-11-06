import { NextResponse } from "next/server";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { requireMutation } from "@/lib/guards-mutation";
import { meetingsForStudent } from "@/lib/college/meetings";
import { getDb, schema } from "@/lib/db";
import { RateLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

// One presence write per student per 10 s (OA2); a faster beat is answered but not written.
const beats = new RateLimiter(1, 10_000, { bypassable: false });

/**
 * Student presence, every 30 s while a Findtern tab is visible. `active` says
 * the student did something in the last 2 minutes; only that moves
 * `last_active_at`, so an idle open tab fades from "Online now". Presence is
 * recorded for every student (employers see it), then the reply carries the
 * live drive (for the banner) and any call requests, so the student's page
 * needs no second poll and no open stream. "View as" never reaches here:
 * requireMutation refuses an impersonated session.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"], allowPendingTerms: true });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const db = getDb();

  const active = ((await req.json().catch(() => null)) as { active?: unknown } | null)?.active === true;
  if (beats.take(uid)) {
    await db
      .insert(schema.userPresence)
      .values({ userType: "intern", userId: uid, lastSeenAt: sql`now()`, lastActiveAt: active ? sql`now()` : null })
      .onConflictDoUpdate({
        target: [schema.userPresence.userType, schema.userPresence.userId],
        set: active ? { lastSeenAt: sql`now()`, lastActiveAt: sql`now()` } : { lastSeenAt: sql`now()` },
      });
  }

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
        // timestamp columns hold UTC wall time; a bare now() would read them in the DB session zone.
        lte(schema.collegeDrives.startsAt, sql`(now() AT TIME ZONE 'UTC')`),
        gt(schema.collegeDrives.endsAt, sql`(now() AT TIME ZONE 'UTC')`),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt)
    .limit(1);

  return NextResponse.json(
    { college: m.collegeId, drive: drive ?? null, meetings: await meetingsForStudent(uid) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
