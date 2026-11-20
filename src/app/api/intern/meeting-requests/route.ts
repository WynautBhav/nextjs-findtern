import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { announceOffer, createMeeting, hasRelationship, INTERN_ZONE, wallsToUtc } from "@/lib/meetings/service";
import { slotsBody } from "@/lib/meetings/route-input";
import { assertProjectActionable } from "@/lib/projects/takedown-guard-server";

const bodySchema = z.object({ interviewId: z.string().min(1).optional(), proposalId: z.string().min(1).optional() });

/**
 * An intern asks for a meeting, ONLY inside a relationship that already exists: name the interview or proposal it belongs to
 * (the employer shortlisted, proposed to or met them). No relationship, no meeting (404, nothing about who). The ask is an
 * open offer by the intern, in IST; the employer picks one of the times or counters.
 */
export async function POST(req: Request, _ctx: { params: Promise<Record<string, never>> }) {
  void _ctx;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const raw = await req.json().catch(() => null);
  const ref = bodySchema.safeParse(raw);
  const walls = slotsBody.safeParse(raw ?? {});
  if (!ref.success || !walls.success || (!ref.data.interviewId && !ref.data.proposalId)) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const uid = guard.session.uid;
  const [anchor] = ref.data.interviewId
    ? await db.select({ employerId: schema.interviews.employerId, projectId: schema.interviews.projectId, timezone: schema.interviews.timezone }).from(schema.interviews).where(and(eq(schema.interviews.id, ref.data.interviewId), eq(schema.interviews.internId, uid))).limit(1)
    : await db.select({ employerId: schema.proposals.employerId, projectId: schema.proposals.projectId, timezone: schema.interviews.timezone }).from(schema.proposals).leftJoin(schema.interviews, eq(schema.interviews.id, schema.proposals.interviewId)).where(and(eq(schema.proposals.id, ref.data.proposalId!), eq(schema.proposals.internId, uid))).limit(1);
  if (!anchor || !(await hasRelationship(db, anchor.employerId, uid, anchor.projectId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (anchor.projectId) {
    const td = await assertProjectActionable(anchor.projectId, anchor.employerId);
    if (!td.ok) return td.response;
  }
  const slots = wallsToUtc(walls.data, INTERN_ZONE);
  if (!slots) return NextResponse.json({ error: "Unknown time." }, { status: 400 });
  const r = await createMeeting(db, { by: "intern", employerId: anchor.employerId, internId: uid, projectId: anchor.projectId, slots, timezone: anchor.timezone ?? "Asia/Kolkata" });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  await announceOffer(db, r.interview, "intern").catch((e) => console.error("[meeting-requests] notify failed", e));
  return NextResponse.json({ interview: { id: r.interview.id } }, { status: 201 });
}
