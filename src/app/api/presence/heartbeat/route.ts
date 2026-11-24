import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { heartbeatLimiter } from "@/lib/heartbeat-limit";

export const dynamic = "force-dynamic";

/** Any signed-in role, every 30 s while a tab is visible. Online is computed on read (lib/presence-logic.ts). */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin", "college"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  if (!heartbeatLimiter.take(`hb:${uid}`)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  await getDb()
    .insert(schema.userPresence)
    .values({ userId: uid, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({ target: schema.userPresence.userId, set: { lastSeenAt: sql`now()` } });
  // Online time for drive summaries: this minute, once (two beats in one minute are one row).
  await getDb()
    .insert(schema.presenceMinutes)
    .values({ userId: uid, minute: sql`date_trunc('minute', now() AT TIME ZONE 'UTC')` })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
