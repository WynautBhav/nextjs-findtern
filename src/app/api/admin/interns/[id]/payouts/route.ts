import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { cycleFor, payoutRefusal } from "@/lib/admin/stipend-dues";
import { loadPlacementDue, lockPlacement } from "@/lib/admin/stipend-queue";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a payout date");

/**
 * Create a stipend payout (pending).
 *
 * Guarded like legacy (ADP-29): a payout belongs to a hired placement, is in
 * INR, is at most one month's share and never more than is still owed, and is
 * refused while another payout for the placement is pending or when the
 * intern's share is ₹0 (Findtern Score below 6). The checks run under a
 * per-placement lock, so two admins cannot both create the same month.
 *
 * `notes` keeps its legacy meaning, the role name the stipend email quotes
 * (DB-17); staff notes go to `raw.opsNote`. `raw.cycle` is written as legacy
 * does, so marking the payout paid in either app queues the next month (DB-18).
 */
const bodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.literal("INR").default("INR"),
  method: z.enum(["bank", "upi"]).default("bank"),
  proposalId: z.string().min(1, "Create payouts from a placement's dues row"),
  scheduledFor: isoDate,
  /** Months this series runs for, this one included (legacy "Months"). */
  months: z.number().int().min(1).max(24).default(1),
  opsNote: z.string().trim().max(500).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const rows = await db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, id)).orderBy(desc(schema.internPayouts.createdAt));
  return NextResponse.json({ payouts: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await lockPlacement(tx, body.proposalId);
    const { due, proposal } = await loadPlacementDue(tx, id, body.proposalId);
    if (!proposal) return { error: "That placement is not this intern's", status: 400 } as const;
    const refusal = payoutRefusal(due, body.amountMinor);
    if (refusal || !due) return { error: refusal ?? "Nothing is left to pay on this placement.", status: 409 } as const;

    const months = Math.min(body.months, due.remainingMonths);
    const [payout] = await tx
      .insert(schema.internPayouts)
      .values({
        internId: id,
        amountMinor: body.amountMinor,
        currency: "INR",
        status: "pending",
        method: body.method,
        notes: proposal.roleTitle || null,
        raw: {
          proposalId: body.proposalId,
          employerId: proposal.employerId,
          scheduledFor: body.scheduledFor,
          source: "employer_due",
          // Later months follow at the full share, whatever this one was.
          cycle: cycleFor(months, due.monthlyShareMinor, body.method),
          ...(body.opsNote ? { opsNote: body.opsNote } : {}),
        },
      })
      .returning();
    return { payout } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ payout: result.payout }, { status: 201 });
}
