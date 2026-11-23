import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { act, actorSlots } from "@/lib/meetings/service";
import { slotsBody } from "@/lib/meetings/route-input";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";

/**
 * The EMPLOYER offers exactly three new times for a booked, lapsed, requested or still-open meeting; it goes back to pending and
 * the candidate chooses one. Interns never offer times (403), and cannot ask to reschedule either. A booked slot's Meet
 * event is deleted and the other side's calendar file withdrawn. Times are typed in the project's zone.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const parsed = slotsBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Offer exactly three time slots." }, { status: 400 });
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (iv.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const td = await assertInterviewActionable(id, guard.session.uid);
  if (!td.ok) return td.response;

  const slots = await actorSlots(db, iv, "employer", parsed.data);
  if (!Array.isArray(slots)) return NextResponse.json({ error: slots.error }, { status: slots.status });
  const r = await act(id, "employer", guard.session.uid, { type: "reschedule", slots });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true });
}
