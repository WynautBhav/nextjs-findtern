import { NextResponse } from "next/server";
import { z } from "zod";

import { decideStudentAndNotify } from "@/lib/college/approval-notify";
import { requireCollegeMutation } from "@/lib/college/guard";
import { LEAVE_NOTE_MAX } from "@/lib/college/leave-request";

const bodySchema = z
  .object({
    userIds: z.array(z.string().min(1).max(64)).min(1).max(100),
    action: z.enum(["accept", "deny", "restore"]),
    note: z.string().max(LEAVE_NOTE_MAX, `Note can be at most ${LEAVE_NOTE_MAX} characters`).optional(),
  })
  .strict();

/**
 * A placement officer accepts, denies or restores students of their OWN college. The college comes from the
 * session, never the body; each id is re-checked against the list approvals.ts computes, so an id from another
 * college (or a stranger's) is "not on your list", exactly like one that does not exist.
 */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "student:decide");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose the students first" }, { status: 400 });
  const { action, note } = parsed.data;
  const actor = { type: "college_admin" as const, id: g.ctx.admin.id };
  let done = 0;
  const failed: string[] = [];
  for (const userId of new Set(parsed.data.userIds)) {
    const out = await decideStudentAndNotify({ collegeId: g.ctx.college.id, domains: g.ctx.college.emailDomains, userId, action, actor, note });
    if (out.ok) done++;
    else if (out.status === 400) return NextResponse.json({ error: out.error }, { status: 400 });
    else failed.push(userId);
  }
  if (done === 0) return NextResponse.json({ error: "That student is not on your list any more. Refresh and try again." }, { status: 404 });
  return NextResponse.json({ ok: true, done, failed: failed.length });
}
