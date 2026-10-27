import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { NUDGE_KINDS, sendNudge } from "@/lib/college/nudge";
import { studentsForCollegeAdmin } from "@/lib/college/scope";

const bodySchema = z.object({
  kind: z.enum(NUDGE_KINDS),
  userIds: z.array(z.string().min(1)).min(1).max(1000),
});

/** Chase one or many students. Only students this officer can see are nudged. */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "nudge:send");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid nudge" }, { status: 400 });

  const visible = new Set((await studentsForCollegeAdmin(g.ctx)).map((s) => s.userId));
  let sent = 0;
  let pushed = 0;
  let skipped = 0;
  const targets = [...new Set(parsed.data.userIds)].filter((id) => {
    if (visible.has(id)) return true;
    skipped++;
    return false;
  });
  // 20 at a time: "nudge all 490 offline" must finish within one request.
  for (let i = 0; i < targets.length; i += 20) {
    const results = await Promise.all(
      targets.slice(i, i + 20).map((userId) =>
        sendNudge({
          collegeId: g.ctx.college.id,
          collegeName: g.ctx.college.name,
          adminId: g.ctx.admin.id,
          userId,
          kind: parsed.data.kind,
        }),
      ),
    );
    for (const r of results) {
      if (r.ok) {
        sent++;
        if (r.pushed) pushed++;
      } else skipped++;
    }
  }
  // `pushed`: reached a phone right now. The rest see it in Findtern (and, for
  // offer/interview chases, by email): the officer is told which is which.
  return NextResponse.json({ sent, pushed, skipped, emailed: parsed.data.kind !== "online" });
}
