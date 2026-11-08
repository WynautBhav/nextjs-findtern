import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { visibilityBody } from "@/lib/presence-input";
import { RateLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);

/**
 * A student shows or hides their online / last seen to employers. The row is the session user's own (no id in the
 * request, so there is nothing to tamper with). Heartbeats keep recording either way; the hide is applied on every
 * employer-facing read (lib/presence.ts).
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  if (!limiter.take(`pv:${uid}`)) return NextResponse.json({ error: "Too many changes. Wait a minute and try again." }, { status: 429 });

  const parsed = visibilityBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose on or off." }, { status: 400 });

  const { showActivity } = parsed.data;
  await getDb()
    .insert(schema.userPresence)
    .values({ userId: uid, showActivity })
    .onConflictDoUpdate({ target: schema.userPresence.userId, set: { showActivity } });
  return NextResponse.json({ showActivity }, { headers: { "Cache-Control": "no-store" } });
}
