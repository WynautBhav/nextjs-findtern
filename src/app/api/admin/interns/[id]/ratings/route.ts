import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { applyRatings } from "@/lib/admin/ratings";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * The four axes the product actually reads.
 *
 * This used to accept `overall` - a key nothing downstream reads - while
 * `interview`, which `RATING_META` and every candidate card do read, was not
 * accepted at all. An admin could therefore never record the AI interview
 * score, and any `overall` they saved was invisible to employers. The four keys
 * here are exactly `RATING_META`, and the Findtern Score is their mean, which
 * is what the pricing bands are built on.
 */
const AXIS = z.number().min(0).max(10);

const bodySchema = z.object({
  communication: AXIS.optional(),
  coding: AXIS.optional(),
  aptitude: AXIS.optional(),
  interview: AXIS.optional(),
  aiFeedbackLink: z.string().optional().nullable(),
  aiRecordingLink: z.string().optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { communication, coding, aptitude, interview } = parsed.data;
  const updatedExtra = applyRatings((row.extraData as Record<string, unknown>) ?? {}, { communication, coding, aptitude, interview });

  if (parsed.data.aiFeedbackLink !== undefined) {
    updatedExtra.aiFeedbackLink = parsed.data.aiFeedbackLink ? parsed.data.aiFeedbackLink.trim() : null;
  }
  if (parsed.data.aiRecordingLink !== undefined) {
    updatedExtra.aiRecordingLink = parsed.data.aiRecordingLink ? parsed.data.aiRecordingLink.trim() : null;
  }

  await db.update(schema.internOnboarding).set({ extraData: updatedExtra }).where(eq(schema.internOnboarding.id, row.id));
  return NextResponse.json({ ok: true, findternScore: updatedExtra.findternScore });
}
