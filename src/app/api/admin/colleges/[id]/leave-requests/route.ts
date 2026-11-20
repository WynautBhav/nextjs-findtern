import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { decideAndNotify } from "@/lib/college/leave-decide";
import { notifyStudentOfDecision } from "@/lib/college/leave-notify";
import { adminEndMembership } from "@/lib/college/leave-request-db";
import { LEAVE_NOTE_MAX } from "@/lib/college/leave-request";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

type Ctx = { params: Promise<{ id: string }> };

const note = z.string().max(LEAVE_NOTE_MAX, `Note can be at most ${LEAVE_NOTE_MAX} characters`).optional();
const bodySchema = z.union([
  z.object({ requestId: z.string().min(1).max(64), action: z.enum(["approve", "reject"]), note }).strict(),
  z.object({ email: z.string().trim().min(3).max(254), action: z.literal("end"), note }).strict(),
]);

/**
 * Findtern admin fallback (the TPO normally decides): approve or reject a pending leave request of this college, or
 * end a student's membership by e-mail. Same logic as the TPO path (decideLeaveRequest); admin-only, CSRF via
 * requireMutation, and the path falls under the companies:write rule. Repeating a decision is `already: true`.
 */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const body = parsed.data;
  const actor = { type: "admin" as const, id: g.session.uid };

  let out;
  let requestId: string | undefined;
  if ("requestId" in body) {
    requestId = body.requestId;
    out = await decideAndNotify({ actor, collegeId: id, requestId, action: body.action, note: body.note });
  } else {
    const r = await adminEndMembership({ adminId: actor.id, collegeId: id, email: body.email, note: body.note });
    out = r;
    requestId = r.requestId;
    if (r.ok && !r.already && requestId) {
      await notifyStudentOfDecision({ userId: r.userId, requestId, collegeId: r.collegeId, status: "approved", note: body.note?.trim() || null });
    }
  }
  if (!out.ok) return NextResponse.json({ error: out.error, code: out.code }, { status: out.status });
  if (!out.already) {
    await recordAdminAudit(getDb(), {
      adminId: actor.id,
      action: "college.leave_decide",
      targetType: "college",
      targetId: id,
      meta: { requestId, studentId: out.userId, outcome: out.status, via: "requestId" in body ? "request" : "end_by_email", hasNote: Boolean(body.note?.trim()) },
    });
  }
  return NextResponse.json({ ok: true, already: out.already, status: out.status });
}
