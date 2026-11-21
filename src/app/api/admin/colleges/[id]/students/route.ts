import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { decideStudentAndNotify } from "@/lib/college/approval-notify";
import { LEAVE_NOTE_MAX } from "@/lib/college/leave-request";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    userIds: z.array(z.string().min(1).max(64)).min(1).max(100),
    action: z.enum(["accept", "deny", "restore"]),
    note: z.string().max(LEAVE_NOTE_MAX).optional(),
  })
  .strict();

/**
 * Findtern admin: the same accept / deny / restore the placement officer has, for this college, plus the one thing
 * the officer cannot do: accept a student matched to the college's list by phone number only (asAdmin).
 * Falls under the companies:write rule (lib/admin/permissions.ts).
 */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const [college] = await getDb().select({ domains: schema.colleges.emailDomains }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });
  const { action, note } = parsed.data;
  let done = 0;
  let failed = 0;
  for (const userId of new Set(parsed.data.userIds)) {
    const out = await decideStudentAndNotify({ collegeId: id, domains: college.domains, userId, action, note, actor: { type: "admin", id: g.session.uid }, asAdmin: true });
    if (!out.ok) {
      if (out.status === 400) return NextResponse.json({ error: out.error, code: out.code }, { status: 400 });
      failed++;
      continue;
    }
    done++;
    if (!out.already) {
      await recordAdminAudit(getDb(), { adminId: g.session.uid, action: `college.student_${out.action}`, targetType: "college", targetId: id, meta: { studentId: out.userId, hasNote: Boolean(note?.trim()) } });
    }
  }
  if (done === 0) return NextResponse.json({ error: "That student is not on this college's list any more. Refresh and try again." }, { status: 404 });
  return NextResponse.json({ ok: true, done, failed });
}
