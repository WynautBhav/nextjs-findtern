import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { NUDGE_KINDS, sendNudge } from "@/lib/college/nudge";
import { tallyNudges, type NudgeResult } from "@/lib/college/nudge-plan";
import { studentsForCollegeAdmin } from "@/lib/college/scope";
import { mailMode, smtpConfigured } from "@/lib/mailer";

// "Nudge all 490 offline" sends every email inside this request, so it needs the longest window we allow.
export const maxDuration = 60;

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
  let notVisible = 0;
  const targets = [...new Set(parsed.data.userIds)].filter((id) => {
    if (visible.has(id)) return true;
    notVisible++;
    return false;
  });
  const results: NudgeResult[] = [];
  // 20 at a time: one student's failure (allSettled) never fails the batch or the request.
  for (let i = 0; i < targets.length; i += 20) {
    const settled = await Promise.allSettled(
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
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else {
        console.error("[nudge] one student failed", s.reason);
        results.push({ ok: false });
      }
    }
  }
  const tally = tallyNudges(results, notVisible);
  if (tally.sent > 0 && tally.emailed === 0) {
    const mode = mailMode();
    if (mode === "log" || !smtpConfigured()) {
      console.warn(`[nudge] ${tally.sent} nudged, 0 emailed: ${mode === "log" ? "MAIL_MODE=log (mail is only logged)" : "SMTP is not configured"}`);
    }
  }
  if (tally.emailFailed > 0) console.warn(`[nudge] ${tally.emailFailed} of ${tally.sent} emails failed at SMTP`);
  // `pushed`: reached a phone right now. `emailed`: emails SMTP accepted; `emailFailed`: SMTP errors or refusals.
  // Everyone else (no PUBLIC_ORIGIN, no address, MAIL_MODE=log) still has the bell. Numbers, so the console's
  // truthy check (`body.emailed`) keeps working.
  return NextResponse.json(tally);
}
