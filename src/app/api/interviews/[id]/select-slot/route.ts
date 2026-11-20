import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { act } from "@/lib/meetings/service";
import { takedownBlock } from "@/lib/projects/takedown";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";

const bodySchema = z.object({ slot: z.number().int().min(1).max(3) });

/**
 * Whoever did NOT make the standing offer picks one of its times (the intern for an employer's offer, the employer for
 * the intern's). Books the Meet through the calendar interface; a stale or double pick is a 409; a pick that clashes
 * with either side's other meeting is a 409 `conflict`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!guard.ok) return guard.response;
  const role = guard.session.role === "employer" ? "employer" : "intern";
  if (role === "intern") {
    const locked = await internLockResponse(guard.session);
    if (locked) return locked;
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const td = await assertInterviewActionable(id, role === "employer" ? guard.session.uid : undefined);
  if (!td.ok) return td.response;

  // A listing Findtern took down cannot get a meeting booked (either side): refused before any calendar event exists.
  const db = getDb();
  const [iv] = await db.select({ projectId: schema.interviews.projectId }).from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (iv?.projectId) {
    const [project] = await db.select({ takenDownAt: schema.projects.takenDownAt }).from(schema.projects).where(eq(schema.projects.id, iv.projectId)).limit(1);
    const blocked = takedownBlock(project, "schedule");
    if (blocked) return NextResponse.json({ error: blocked, code: "listing_taken_down" }, { status: 409 });
  }
  const r = await act(id, role, guard.session.uid, { type: "choose", slot: parsed.data.slot });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, meetingReady: Boolean(r.interview.meetingLink) });
}
