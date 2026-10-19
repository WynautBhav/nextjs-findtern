import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notifyStipendPaid } from "@/lib/payments";

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

const bodySchema = z
  .object({
    amountMinor: z.number().int().positive(),
    // Legacy accepted these two only; anything else broke totals and the email.
    currency: z.enum(["INR", "USD"]).default("INR"),
    status: z.enum(["pending", "paid", "failed"]).default("pending"),
    method: z.string().default("bank"),
    referenceId: z.string().optional(),
    notes: z.string().optional(),
    /** Which placement and month this pays; legacy groups payouts by these. */
    proposalId: z.string().optional(),
    employerId: z.string().optional(),
    /** Required, as in legacy: when the transfer is due. */
    scheduledFor: isoDate,
    paidAt: isoDate.optional(),
    source: z.string().max(40).optional(),
  })
  .refine((b) => b.status !== "paid" || (b.referenceId ?? "").trim().length > 0, {
    message: "A bank reference is required to record a paid payout",
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

  const db = getDb();
  const { proposalId, employerId, scheduledFor, paidAt, source, ...row } = parsed.data;
  if (proposalId) {
    const [proposal] = await db
      .select({ internId: schema.proposals.internId, employerId: schema.proposals.employerId })
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId))
      .limit(1);
    if (!proposal || proposal.internId !== id) return NextResponse.json({ error: "That placement is not this intern's" }, { status: 400 });
  }
  const [payout] = await db
    .insert(schema.internPayouts)
    .values({
      internId: id,
      ...row,
      paidAt: row.status === "paid" ? (paidAt ? new Date(paidAt) : new Date()) : null,
      raw: { proposalId, employerId, scheduledFor, source: source ?? "admin" },
    })
    .returning();
  await notifyStipendPaid(payout.id);
  return NextResponse.json({ payout }, { status: 201 });
}
