import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { parseOffer } from "@/lib/offer";

const offerSchema = z.object({
  roleTitle: z.string().trim().min(1).max(120).optional(),
  duration: z.enum(["1m", "2m", "3m", "6m"]).optional(),
  startDate: z.string().trim().max(24).optional(),
  monthlyHours: z.number().int().min(1).max(300).optional(),
  paidLeavesPerMonth: z.number().min(0).max(31).optional(),
  message: z.string().trim().max(2000).optional(),
});

const bodySchema = z.object({ offer: offerSchema }).refine((b) => Object.keys(b.offer).length > 0, {
  message: "Nothing to update",
});

/**
 * Edit a live offer's terms. Draft / sent only - once the intern responds
 * (accepted / rejected) or the trail closes (hired / withdrawn / expired),
 * the terms are history and editing them would rewrite what both sides saw.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid offer" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(schema.proposals)
    .where(eq(schema.proposals.id, id))
    .limit(1);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role !== "admin" && proposal.employerId !== session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["draft", "sent"].includes(proposal.status)) {
    return NextResponse.json(
      { error: `A ${proposal.status} proposal can no longer be edited` },
      { status: 409 },
    );
  }

  const { message, ...edits } = parsed.data.offer;
  const current = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current, ...edits, ...(message !== undefined ? { jd: message } : {}) };
  // Hours or duration moved: keep the money consistent with them.
  if (edits.duration !== undefined || edits.monthlyHours !== undefined) {
    const o = parseOffer(next, proposal.currency);
    const monthlyMinor = o.hourlyRateMinor ? Math.round(o.monthlyHours * o.hourlyRateMinor) : (o.monthlyMinor ?? 0);
    next.monthlyAmount = monthlyMinor / 100;
    next.totalPrice = (monthlyMinor * o.months + (o.perHireMinor ?? 0)) / 100;
  }
  const [updated] = await db
    .update(schema.proposals)
    .set({ offerDetails: next, updatedAt: new Date() })
    // Still unanswered at write time, so an acceptance can't be overwritten.
    .where(and(eq(schema.proposals.id, id), inArray(schema.proposals.status, ["draft", "sent"])))
    .returning({ updatedAt: schema.proposals.updatedAt });
  if (!updated) {
    return NextResponse.json({ error: "The candidate has already answered this offer." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt ?? null });
}
