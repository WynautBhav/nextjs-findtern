import { NextResponse } from "next/server";
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { isParticipant, otherParticipant, sanitizeBody } from "@/lib/messaging/logic";
import { getThread, messageLimiter, pushEvent } from "@/lib/messaging/store";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const thread = await getThread(id);
  if (!isParticipant(thread, session.uid)) return notFound();

  const before = new URL(req.url).searchParams.get("before");
  const beforeDate = before ? new Date(before) : null;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.threadId, id),
        beforeDate && !Number.isNaN(beforeDate.getTime()) ? lt(schema.messages.createdAt, beforeDate) : undefined,
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(50);

  // Opening the thread marks the other side's messages delivered.
  await db
    .update(schema.messages)
    .set({ deliveredAt: sql`now()` })
    .where(and(eq(schema.messages.threadId, id), ne(schema.messages.senderId, session.uid), isNull(schema.messages.deliveredAt)));

  return NextResponse.json(
    {
      messages: rows.reverse().map((m) => ({ id: m.id, mine: m.senderId === session.uid, body: m.body, createdAt: m.createdAt, deliveredAt: m.deliveredAt, readAt: m.readAt })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const Body = z.object({ body: z.string().min(1).max(4000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const thread = await getThread(id);
  if (!thread || !isParticipant(thread, session.uid)) return notFound();
  if (!messageLimiter.take(`msg:${session.uid}`)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = sanitizeBody(parsed.data.body);
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  const db = getDb();
  const [m] = await db.insert(schema.messages).values({ threadId: id, senderId: session.uid, body }).returning();
  await db.update(schema.threads).set({ lastMessageAt: m.createdAt }).where(eq(schema.threads.id, id));
  const other = otherParticipant(thread, session.uid)!;
  await pushEvent(other, "message.new", { threadId: id, messageId: m.id, createdAt: m.createdAt });

  return NextResponse.json({ message: { id: m.id, mine: true, body: m.body, createdAt: m.createdAt, deliveredAt: null, readAt: null } }, { status: 201 });
}
