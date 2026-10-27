import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { requireCollegeRead } from "@/lib/college/guard";
import { auditCollegeView, studentForCollegeAdmin } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";

/**
 * Open a student's AI interview recording or report. The URL never appears in
 * the dashboard's HTML: the officer clicks through here, the view is written
 * to the audit log, then they are redirected. Students cannot reach this.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; artifact: string }> }) {
  const g = await requireCollegeRead();
  if (!g.ok) return g.response;
  const { id, artifact } = await ctx.params;
  if (artifact !== "recording" && artifact !== "report") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const student = await studentForCollegeAdmin(g.ctx, id);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [onboarding] = await getDb()
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, id))
    .limit(1);
  const extra = (onboarding?.extra as Record<string, unknown>) ?? {};
  const links = await aiInterviewLinks(id, extra);
  const asUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);
  const url =
    artifact === "recording"
      ? links.recordingLink ?? asUrl(extra.incruiterRecordingUrl)
      : links.feedbackLink ?? asUrl(extra.incruiterReportUrl);
  if (!url) return NextResponse.json({ error: `No ${artifact} yet` }, { status: 404 });

  await auditCollegeView(
    { collegeId: g.ctx.college.id, actorType: "college_admin", actorId: g.ctx.admin.id },
    artifact === "recording" ? "view_recording" : "view_report",
    id,
  );
  return NextResponse.redirect(url, { status: 303, headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
