import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { employerNoShow, isMeetingLinkLive, joinCounts } from "@/lib/employer-interview-rules";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { safeMeetingHref } from "@/lib/interview-join";
import { hasAccepted } from "@/lib/meetings/gate-service";

/**
 * /meet/<token> -> the Meet URL, only for a signed-in party of a booked, live meeting. The one place the raw link appears is this
 * redirect, and only after the person accepted the CURRENT disclaimer at the gate (see src/lib/meetings/gate.ts for what that does and does not
 * guarantee). The employer's first counted join is stamped.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/meet/${encodeURIComponent(token)}?${q}`, req.url));
  const session = await getSession();
  if (!session || (session.role !== "employer" && session.role !== "intern")) return NextResponse.redirect(new URL(`/${session ? "" : "login"}`, req.url));
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.gateToken, token)).limit(1);
  const party = iv && (session.role === "employer" ? iv.employerId : iv.internId) === session.uid;
  if (!iv || !party) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (iv.status !== "scheduled" || !iv.selectedSlot || interviewLifecycle(iv).expired || employerNoShow(iv)) return back("e=closed");
  const link = isMeetingLinkLive(iv) ? safeMeetingHref(iv.meetingLink) : null;
  if (!link) return back("e=pending");
  // No acceptance of this disclaimer version yet: back to the gate, which shows the countdown.
  if (!(await hasAccepted(db, iv.id, { role: session.role, uid: session.uid }))) return NextResponse.redirect(new URL(`/meet/${encodeURIComponent(token)}`, req.url));
  if (session.role === "employer" && joinCounts(iv)) {
    await db.update(schema.interviews).set({ employerJoinedAt: new Date() }).where(and(eq(schema.interviews.id, iv.id), isNull(schema.interviews.employerJoinedAt)));
  }
  return NextResponse.redirect(link);
}
