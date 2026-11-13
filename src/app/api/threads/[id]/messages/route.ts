import { NextResponse } from "next/server";
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { SCRUBBED_NOTICE, scrubOutgoing } from "@/lib/contact-scrub";
import { SEND_BLOCK_TEXT, canSend, isParticipant, otherParticipant, sanitizeBody } from "@/lib/messaging/logic";
import { getThread, loadThreadContexts, messageLimiter, pushEvent, visibleBody } from "@/lib/messaging/store";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const thread = await getThread(id);
  if (!isParticipant(thread, session.uid)) return notFound();

  const ctx0 = (await loadThreadContexts([thread!])).get(id);
  const role = session.role === "employer" ? "employer" : "intern";
  const gate = ctx0 ? canSend({ role, employerHasMessaged: ctx0.employerHasMessaged, proposalStatus: ctx0.proposalStatus }) : { ok: true as const };

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
      messages: rows.reverse().map((m) => ({ id: m.id, mine: m.senderId === session.uid, body: visibleBody(m.body, ctx0), createdAt: m.createdAt, deliveredAt: m.deliveredAt, readAt: m.readAt })),
      closed: !gate.ok && gate.reason === "closed",
      sendBlock: gate.ok ? null : gate.reason,
      sendBlockText: gate.ok ? null : SEND_BLOCK_TEXT[gate.reason][role],
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
  const clean = sanitizeBody(parsed.data.body);
  if (!clean) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  // Rows 11 and 24: a withdrawn proposal closes the thread; an intern may write only after the employer has.
  const role = session.role === "employer" ? "employer" : "intern";
  const tctx = (await loadThreadContexts([thread])).get(id);
  const gate = canSend({ role, employerHasMessaged: tctx?.employerHasMessaged ?? false, proposalStatus: tctx?.proposalStatus });
  if (!gate.ok) return NextResponse.json({ error: SEND_BLOCK_TEXT[gate.reason][role], code: gate.reason }, { status: 409 });

  // Row 10: until the hire is paid, contact details and names are removed before the text is stored.
  const scrub = tctx && !tctx.hired ? scrubOutgoing(clean, tctx.denyTerms) : null;
  const body = scrub ? scrub.text : clean;

  const db = getDb();
  const [m] = await db.insert(schema.messages).values({ threadId: id, senderId: session.uid, body }).returning();
  await db.update(schema.threads).set({ lastMessageAt: m.createdAt }).where(eq(schema.threads.id, id));
  const other = otherParticipant(thread, session.uid)!;
  await pushEvent(other, "message.new", { threadId: id, messageId: m.id, createdAt: m.createdAt });

  const scrubbed = !!scrub?.changed;
  return NextResponse.json(
    { message: { id: m.id, mine: true, body: m.body, createdAt: m.createdAt, deliveredAt: null, readAt: null }, scrubbed, notice: scrubbed ? SCRUBBED_NOTICE : null },
    { status: 201 },
  );
}
