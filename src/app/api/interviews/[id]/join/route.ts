import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNoShow, isMeetingLinkLive, joinCounts, normalizeMeetingLink } from "@/lib/employer-interview-rules";

/**
 * The employer pressed "Join meeting". Records the first time it counted
 * (`employer_joined_at`), which is what keeps a booked interview from
 * expiring as an employer no-show (bug sheet 12 Nov, row 13), and returns the
 * link to open. A click well before the start only returns the link, so
 * opening it days early cannot stand in for turning up.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (interview.status !== "scheduled" || !interview.selectedSlot) {
    return NextResponse.json({ error: "Only a booked interview can be joined." }, { status: 409 });
  }
  if (employerNoShow(interview)) {
    return NextResponse.json(
      { error: "This interview expired: the employer did not join within 30 minutes of the start. Offer new times instead." },
      { status: 409 },
    );
  }
  const link = isMeetingLinkLive(interview) ? normalizeMeetingLink(interview.meetingLink) : null;
  if (!link) return NextResponse.json({ error: "The meeting link is not ready. We'll email it." }, { status: 409 });

  if (joinCounts(interview)) {
    // First join wins; later clicks leave the stamp alone.
    await db
      .update(schema.interviews)
      .set({ employerJoinedAt: new Date() })
      .where(and(eq(schema.interviews.id, id), isNull(schema.interviews.employerJoinedAt)));
  }
  return NextResponse.json({ ok: true, link });
}
