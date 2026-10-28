import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { MISSED_GRACE_MINUTES, canMarkMissed } from "@/lib/employer-interview-rules";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only a scheduled interview, and only once its start plus a 15-minute
  // grace period has passed (legacy R:11851).
  if (interview.status !== "scheduled" || !interview.selectedSlot || !canMarkMissed(interview)) {
    return NextResponse.json(
      { error: `You can mark an interview missed ${MISSED_GRACE_MINUTES} minutes after its start time.` },
      { status: 409 },
    );
  }
  const updated = await db
    .update(schema.interviews)
    .set({ status: "missed", updatedAt: new Date() })
    .where(and(eq(schema.interviews.id, id), eq(schema.interviews.status, "scheduled"), eq(schema.interviews.selectedSlot, interview.selectedSlot)))
    .returning({ id: schema.interviews.id });
  if (updated.length === 0) return NextResponse.json({ error: "This interview changed; refresh and try again." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
