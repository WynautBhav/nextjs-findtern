import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only a scheduled interview whose time has passed can be missed.
  const start = interview.selectedSlot ? [interview.slot1, interview.slot2, interview.slot3][interview.selectedSlot - 1] : null;
  if (interview.status !== "scheduled" || !start || start.getTime() > Date.now()) {
    return NextResponse.json({ error: "You can mark an interview missed once its time has passed." }, { status: 409 });
  }
  await db.update(schema.interviews).set({ status: "missed", updatedAt: new Date() }).where(eq(schema.interviews.id, id));
  return NextResponse.json({ ok: true });
}
