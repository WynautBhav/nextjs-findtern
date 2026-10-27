import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { effectiveStatus, toView } from "@/lib/college/meetings";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

/** The student answers a call request. Only their own; only while it is open. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.collegeDriveMeetings)
    .where(and(eq(schema.collegeDriveMeetings.id, id), eq(schema.collegeDriveMeetings.userId, guard.session.uid)))
    .limit(1);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (effectiveStatus(m) !== "requested") {
    return NextResponse.json({ error: "This request has already closed" }, { status: 409 });
  }
  // Rows made before QA-001 could have no link; accepting one leads nowhere.
  if (parsed.data.action === "accept" && !m.meetingLink) {
    return NextResponse.json({ error: "This call has no meeting link. Ask the employer to send a new request." }, { status: 409 });
  }
  const [row] = await db
    .update(schema.collegeDriveMeetings)
    .set({ status: parsed.data.action === "accept" ? "accepted" : "declined", respondedAt: new Date() })
    .where(and(eq(schema.collegeDriveMeetings.id, id), eq(schema.collegeDriveMeetings.status, "requested")))
    .returning();
  if (!row) return NextResponse.json({ error: "This request has already closed" }, { status: 409 });
  return NextResponse.json({ meeting: toView(row) });
}
