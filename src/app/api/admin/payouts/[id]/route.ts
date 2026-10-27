import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notifyStipendPaid } from "@/lib/payments";
import { proposalOf } from "@/lib/admin/stipend-dues";
import { queueNextMonth } from "@/lib/admin/stipend-queue";

const patchSchema = z
  .object({
    status: z.enum(["pending", "paid", "failed"]).optional(),
    referenceId: z.string().trim().max(64).nullish(),
    /** Staff note. Stored in `raw.opsNote`: `notes` is the role name the
        stipend email quotes in legacy (DB-17), so it is never overwritten. */
    opsNote: z.string().trim().max(500).nullish(),
    /** Old name for `opsNote`, still accepted. */
    notes: z.string().trim().max(500).nullish(),
  })
  .refine((b) => b.status !== undefined || b.referenceId !== undefined || b.opsNote !== undefined || b.notes !== undefined, {
    message: "Nothing to update",
  })
  .refine((b) => b.status !== "paid" || (b.referenceId ?? "").trim().length > 0, {
    message: "A bank reference is required to mark a payout paid",
  });

/**
 * Update one intern payout (status / bank reference / ops note).
 *
 * Bank transfers happen outside the app, so someone records the reference
 * and moves pending → paid or failed. Rules: a paid payout is money that
 * left the bank and is never reopened; only a pending payout becomes paid
 * (ADP-31); a failed one may go back to pending only when nothing else is
 * pending for the same placement, so a retry can never double-pay.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select({
      id: schema.internPayouts.id,
      internId: schema.internPayouts.internId,
      status: schema.internPayouts.status,
      amountMinor: schema.internPayouts.amountMinor,
      currency: schema.internPayouts.currency,
      method: schema.internPayouts.method,
      notes: schema.internPayouts.notes,
      raw: schema.internPayouts.raw,
    })
    .from(schema.internPayouts)
    .where(eq(schema.internPayouts.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  const to = body.status;
  if (existing.status === "paid" && to !== undefined) {
    return NextResponse.json(
      { error: to === "paid" ? "Already paid" : "This payout is already paid and can't be reopened" },
      { status: 409 },
    );
  }
  if (to === "paid" && existing.status !== "pending") {
    return NextResponse.json({ error: "Only a pending payout can be marked paid" }, { status: 409 });
  }
  if (to === "pending" && existing.status !== "pending") {
    const proposalId = proposalOf(existing.raw);
    if (proposalId) {
      const [other] = await db
        .select({ id: schema.internPayouts.id })
        .from(schema.internPayouts)
        .where(
          and(
            eq(schema.internPayouts.internId, existing.internId),
            eq(schema.internPayouts.status, "pending"),
            ne(schema.internPayouts.id, id),
            sql`coalesce(${schema.internPayouts.raw}->>'proposalId', ${schema.internPayouts.raw}->>'proposal_id') = ${proposalId}`,
          ),
        )
        .limit(1);
      if (other) return NextResponse.json({ error: "Another payout is already pending for this placement" }, { status: 409 });
    }
  }

  const set: Partial<typeof schema.internPayouts.$inferInsert> = { updatedAt: new Date() };
  if (to !== undefined) {
    set.status = to;
    set.paidAt = to === "paid" ? new Date() : null;
  }
  if (body.referenceId !== undefined) set.referenceId = (body.referenceId ?? "").trim() || null;
  const note = body.opsNote !== undefined ? body.opsNote : body.notes;
  if (note !== undefined) {
    const raw = { ...((existing.raw ?? {}) as Record<string, unknown>) };
    const text = (note ?? "").trim();
    if (text) raw.opsNote = text;
    else delete raw.opsNote;
    set.raw = raw;
  }

  // Conditional on the status read above, so two admins cannot both mark it.
  const updated = await db
    .update(schema.internPayouts)
    .set(set)
    .where(and(eq(schema.internPayouts.id, id), eq(schema.internPayouts.status, existing.status)))
    .returning({ id: schema.internPayouts.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "This payout changed meanwhile. Reload and try again." }, { status: 409 });
  }

  let next = null;
  if (to === "paid") {
    await notifyStipendPaid(id);
    next = await queueNextMonth(db, existing.internId, existing);
  }
  return NextResponse.json({ ok: true, next });
}
