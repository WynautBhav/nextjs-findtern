import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notifyStipendPaid } from "@/lib/payments";
import { queueNextMonth } from "@/lib/admin/stipend-queue";

/**
 * Mark a payout paid.
 *
 * `referenceId` - the bank reference - is required here rather than being a
 * separate write. A payout row that says "paid" with no reference cannot be
 * reconciled against a bank statement later, and the whole point of recording
 * the payout at all is that reconciliation. One call, one row, no intermediate
 * state where a payout is marked paid but the reference is missing.
 */
const bodySchema = z.object({ referenceId: z.string().trim().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; payoutId: string }> }) {
  const { id, payoutId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A bank reference is required" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({
      status: schema.internPayouts.status,
      method: schema.internPayouts.method,
      notes: schema.internPayouts.notes,
      raw: schema.internPayouts.raw,
    })
    .from(schema.internPayouts)
    .where(and(eq(schema.internPayouts.id, payoutId), eq(schema.internPayouts.internId, id)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Unknown payout" }, { status: 404 });
  // Legacy answered "Already paid"; overwriting would restamp the date and
  // swap the bank reference on money that already left.
  if (existing.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });

  const updated = await db
    .update(schema.internPayouts)
    .set({
      status: "paid",
      paidAt: new Date(),
      referenceId: parsed.data.referenceId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.internPayouts.id, payoutId),
        eq(schema.internPayouts.internId, id),
      ),
    )
    .returning({ id: schema.internPayouts.id });

  if (updated.length === 0) return NextResponse.json({ error: "Unknown payout" }, { status: 404 });
  await notifyStipendPaid(payoutId);
  const next = await queueNextMonth(db, id, existing);
  return NextResponse.json({ ok: true, next });
}
