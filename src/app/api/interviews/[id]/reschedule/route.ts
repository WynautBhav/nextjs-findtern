import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  slot1: z.string().datetime().optional(),
  slot2: z.string().datetime().optional(),
  slot3: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid && interview.internId !== guard.session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .update(schema.interviews)
    .set({
      slot1: parsed.data.slot1 ? new Date(parsed.data.slot1) : interview.slot1,
      slot2: parsed.data.slot2 ? new Date(parsed.data.slot2) : interview.slot2,
      slot3: parsed.data.slot3 ? new Date(parsed.data.slot3) : interview.slot3,
      status: "pending",
      selectedSlot: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.interviews.id, id));
  return NextResponse.json({ ok: true });
}
