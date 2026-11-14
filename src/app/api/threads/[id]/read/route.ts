import { NextResponse } from "next/server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { isParticipant, otherParticipant } from "@/lib/messaging/logic";
import { getThread, pushEvent } from "@/lib/messaging/store";
import { internLockResponse } from "@/lib/intern-unlock";

export const dynamic = "force-dynamic";

/** Marks the other side's messages read and tells them. Non-participants get 404. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const uid = guard.session.uid;
  const thread = await getThread(id);
  if (!thread || !isParticipant(thread, uid)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await getDb()
    .update(schema.messages)
    .set({ readAt: sql`now()`, deliveredAt: sql`coalesce(${schema.messages.deliveredAt}, now())` })
    .where(and(eq(schema.messages.threadId, id), ne(schema.messages.senderId, uid), isNull(schema.messages.readAt)))
    .returning({ id: schema.messages.id });
  if (updated.length) await pushEvent(otherParticipant(thread, uid)!, "message.read", { threadId: id, count: updated.length });
  return NextResponse.json({ ok: true, marked: updated.length });
}
