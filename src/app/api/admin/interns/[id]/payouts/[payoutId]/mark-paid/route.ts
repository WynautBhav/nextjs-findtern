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
 * reconciled against a bank statement later. Only a pending payout can be
 * marked paid (legacy offered the button on pending rows only, ADP-31): a
 * failed transfer is re-tried as a new payout, not flipped to paid.
 */
const bodySchema = z.object({ referenceId: z.string().trim().min(1).max(64) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; payoutId: string }> }) {
  const { id, payoutId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A bank reference is required" }, { status: 400 });
  }

  const db = getDb();
  // Conditional on the row still being pending, so a double click or two
  // admins cannot both mark it (and both queue a next month).
  const updated = await db
    .update(schema.internPayouts)
    .set({ status: "paid", paidAt: new Date(), referenceId: parsed.data.referenceId, updatedAt: new Date() })
    .where(and(eq(schema.internPayouts.id, payoutId), eq(schema.internPayouts.internId, id), eq(schema.internPayouts.status, "pending")))
    .returning({
      amountMinor: schema.internPayouts.amountMinor,
      currency: schema.internPayouts.currency,
      method: schema.internPayouts.method,
      notes: schema.internPayouts.notes,
      raw: schema.internPayouts.raw,
    });

  if (updated.length === 0) {
    const [existing] = await db
      .select({ status: schema.internPayouts.status })
      .from(schema.internPayouts)
      .where(and(eq(schema.internPayouts.id, payoutId), eq(schema.internPayouts.internId, id)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Unknown payout" }, { status: 404 });
    if (existing.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });
    return NextResponse.json({ error: "Only a pending payout can be marked paid" }, { status: 409 });
  }

  // Queue first: the row is already "paid", so a retry would 409 and never queue.
  const next = await queueNextMonth(db, id, updated[0]);
  try {
    await notifyStipendPaid(payoutId);
  } catch (err) {
    console.error("[mark-paid] notifyStipendPaid failed", payoutId, err);
  }
  return NextResponse.json({ ok: true, next });
}
