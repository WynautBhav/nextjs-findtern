import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notifyStipendPaid } from "@/lib/payments";
import { canPayOut } from "@/lib/admin/payout-kind";
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
  // A "paid" stipend has to be traceable to an account: no bank details on file, no mark-paid.
  const [onboarding] = await db.select({ extra: schema.internOnboarding.extraData }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  const payable = canPayOut(onboarding?.extra as Record<string, unknown> | null | undefined);
  if (!payable.ok) return NextResponse.json({ error: payable.error }, { status: 409 });
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
      kind: schema.internPayouts.kind,
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

  await recordAdminAudit(db, { adminId: guard.session.uid, action: "payout.mark_paid", targetType: "payout", targetId: payoutId, meta: { internId: id, amountMinor: updated[0].amountMinor, referenceId: parsed.data.referenceId } });
  // Queue first: the row is already "paid", so a retry would 409 and never queue.
  // A completion bonus is a one-off: no next month.
  const next = updated[0].kind === "stipend" ? await queueNextMonth(db, id, updated[0]) : null;
  try {
    await notifyStipendPaid(payoutId);
  } catch (err) {
    console.error("[mark-paid] notifyStipendPaid failed", payoutId, err);
  }
  return NextResponse.json({ ok: true, next });
}
