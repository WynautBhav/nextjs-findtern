import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notifyStipendPaid } from "@/lib/payments";
import { queueNextMonth } from "@/lib/admin/stipend-queue";

const patchSchema = z
  .object({
    status: z.enum(["pending", "paid", "failed"]).optional(),
    referenceId: z.string().trim().max(64).nullish(),
    notes: z.string().trim().max(500).nullish(),
  })
  .refine((body) => body.status !== undefined || body.referenceId !== undefined || body.notes !== undefined, {
    message: "Nothing to update",
  })
  .refine(
    (body) => body.status !== "paid" || (body.referenceId ?? "").trim().length > 0,
    { message: "A reference ID is required to mark a payout completed" },
  );

/**
 * Update one intern payout (status / bank reference / ops note).
 *
 * The ledger page is read-only without this: bank transfers happen outside
 * the app, so someone has to record the reference and flip pending →
 * completed. Employer payments are gateway-driven and deliberately have no
 * manual edit path - this route is payouts only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({
      id: schema.internPayouts.id,
      internId: schema.internPayouts.internId,
      status: schema.internPayouts.status,
      method: schema.internPayouts.method,
      notes: schema.internPayouts.notes,
      raw: schema.internPayouts.raw,
    })
    .from(schema.internPayouts)
    .where(eq(schema.internPayouts.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  // A paid payout is money that left the bank: it cannot be re-opened or re-paid.
  if (existing.status === "paid" && parsed.data.status !== undefined && parsed.data.status !== "paid") {
    return NextResponse.json({ error: "This payout is already paid and can't be reopened" }, { status: 409 });
  }
  if (existing.status === "paid" && parsed.data.status === "paid") {
    return NextResponse.json({ error: "Already paid" }, { status: 409 });
  }

  const set: Partial<typeof schema.internPayouts.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) {
    set.status = parsed.data.status;
    set.paidAt = parsed.data.status === "paid" ? new Date() : null;
  }
  if (parsed.data.referenceId !== undefined) {
    const ref = (parsed.data.referenceId ?? "").trim();
    set.referenceId = ref || null;
  }
  if (parsed.data.notes !== undefined) {
    const notes = (parsed.data.notes ?? "").trim();
    set.notes = notes || null;
  }

  await db.update(schema.internPayouts).set(set).where(eq(schema.internPayouts.id, id));
  let next = null;
  if (parsed.data.status === "paid" && existing.status !== "paid") {
    await notifyStipendPaid(id);
    next = await queueNextMonth(db, existing.internId, existing);
  }
  return NextResponse.json({ ok: true, next });
}
