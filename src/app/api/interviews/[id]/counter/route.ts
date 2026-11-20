import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { act, actorSlots } from "@/lib/meetings/service";
import { slotsBody } from "@/lib/meetings/route-input";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";

/**
 * Either side answers an open offer with up to three times of its own (when none of the offered ones work). The offer flips to
 * the replier, the round goes up (max 3), and the other side picks or counters in turn. Interns type IST, employers the project's zone.
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
  const parsed = slotsBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((role === "employer" ? iv.employerId : iv.internId) !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const td = await assertInterviewActionable(id, role === "employer" ? guard.session.uid : undefined);
  if (!td.ok) return td.response;

  const slots = await actorSlots(db, iv, role, parsed.data);
  if (!Array.isArray(slots)) return NextResponse.json({ error: slots.error }, { status: slots.status });
  const r = await act(id, role, guard.session.uid, { type: "counter", slots });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true });
}
