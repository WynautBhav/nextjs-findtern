import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { counterpartOf, counterpartSeen, threadFor, threadMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

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
