import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { canMarkCompleted } from "@/lib/employer-interview-rules";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only a booked meeting whose start time has come (bug sheet 8): a finished
  // call stops holding the candidate, so a proposal can follow straight away.
  if (!canMarkCompleted(interview)) {
    return NextResponse.json({ error: "You can mark a meeting completed once its start time has come." }, { status: 409 });
  }
  const updated = await db
    .update(schema.interviews)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(schema.interviews.id, id), eq(schema.interviews.status, "scheduled"), eq(schema.interviews.selectedSlot, interview.selectedSlot!)))
    .returning({ id: schema.interviews.id });
  if (updated.length === 0) return NextResponse.json({ error: "This interview changed; refresh and try again." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
