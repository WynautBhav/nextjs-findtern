import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ slot: z.number().int().min(1).max(3) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.internId !== guard.session.uid && interview.employerId !== guard.session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .update(schema.interviews)
    .set({ selectedSlot: parsed.data.slot, status: "scheduled", updatedAt: new Date() })
    .where(eq(schema.interviews.id, id));
  return NextResponse.json({ ok: true });
}
