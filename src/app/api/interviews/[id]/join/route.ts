import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { safeMeetingHref } from "@/lib/interview-join";
import { employerNoShow, isMeetingLinkLive } from "@/lib/employer-interview-rules";

/**
 * Kept for older clients: it no longer hands out the Meet URL. The employer's Join now goes through the recorded gate at
 * /meet/<token> (migration 0044), whose redirect also stamps `employer_joined_at`. This answers with the gate address once the
 * booking is joinable, so a script cannot get the raw link here and skip the disclaimer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const td = await assertInterviewActionable(id, guard.session.uid);
  if (!td.ok) return td.response;

  if (interview.status !== "scheduled" || !interview.selectedSlot) {
    return NextResponse.json({ error: "Only a booked interview can be joined." }, { status: 409 });
  }
  if (employerNoShow(interview)) {
    return NextResponse.json(
      { error: "This interview expired: the employer did not join within 30 minutes of the start. Offer new times instead." },
      { status: 409 },
    );
  }
  // Time passed and nobody marked it: it reads Expired everywhere, so there is nothing to join.
  if (interviewLifecycle(interview).expired) return NextResponse.json({ error: "This interview's time has passed. Schedule it again instead." }, { status: 409 });
  const link = isMeetingLinkLive(interview) ? safeMeetingHref(interview.meetingLink) : null;
  if (!link) return NextResponse.json({ error: "The meeting link is not ready. We'll email it." }, { status: 409 });

  return NextResponse.json({ ok: true, gate: `/api/interviews/${encodeURIComponent(id)}/gate` });
}
