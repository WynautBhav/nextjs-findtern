import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { accountActive, counterpartOf, counterpartSeen, threadFor, threadMessages } from "@/lib/messages";
import { RateLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** The thread view polls every 12 s; this leaves room for several tabs, not for a scraper. */
const reads = new RateLimiter(60, 60_000, { bypassable: false });

/**
 * One conversation, for a participant only (a View as admin reads as that
 * person). Anyone else, a college officer included, gets 404, so an id never
 * confirms that a thread exists. `?after=<messageId>` returns what is newer.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "intern" && session.role !== "employer") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const viewer = { role: session.role, id: session.uid } as const;
  if (!reads.take(viewer.id)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(reads.retryAfterSeconds(viewer.id)) } });
  if (!(await accountActive(viewer))) return NextResponse.json({ error: "Your account can't read messages right now. Contact Findtern support." }, { status: 403 });

  const { id } = await ctx.params;
  const thread = await threadFor(viewer, id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const after = new URL(req.url).searchParams.get("after");
  const who = await counterpartOf(viewer, thread);
  const messages = await threadMessages(viewer, thread, after && after.length <= 80 ? after : null, who.unlocked);
  return NextResponse.json(
    { messages, seen: await counterpartSeen(viewer, thread), counterpart: { name: who.name, presence: who.presence } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
