import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyOfficersOfRequest } from "@/lib/college/leave-notify";
import { cancelLeaveRequest, createLeaveRequest } from "@/lib/college/leave-request-db";
import { LEAVE_REASON_MAX } from "@/lib/college/leave-request";
import { membershipOf } from "@/lib/college/membership";
import { requireMutation } from "@/lib/guards-mutation";

// Strict: nothing but an optional reason. The college always comes from the student's own membership.
const bodySchema = z.object({ reason: z.string().max(LEAVE_REASON_MAX, `Reason can be at most ${LEAVE_REASON_MAX} characters`).optional() }).strict();

/** Ask the college's placement officer to let you leave. One pending request at a time; a rejected one can be re-filed. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request", code: "bad_reason" }, { status: 400 });

  const r = await createLeaveRequest(uid, parsed.data.reason);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  await notifyOfficersOfRequest({ userId: uid, collegeId: r.collegeId, collegeName: r.collegeName, reason: parsed.data.reason?.trim() || null });
  return NextResponse.json({ ok: true, college: await membershipOf(uid) });
}

/** Withdraw your own pending request. */
export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  if (!(await cancelLeaveRequest(uid))) return NextResponse.json({ error: "You have no leave request waiting." }, { status: 404 });
  return NextResponse.json({ ok: true, college: await membershipOf(uid) });
}
