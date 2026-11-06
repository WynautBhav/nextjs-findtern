import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { paidSeatTotal } from "@/lib/college/seat-gate";
import { firstPaymentProblem } from "@/lib/college/seat-paid";
import { createTpoCode } from "@/lib/college/tpo-code";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { seatCapProblem } from "@/lib/promo-rules";

type Ctx = { params: Promise<{ id: string }> };

/** A discount code, so it also needs money permission on top of the college write the path rule asks for. */
const NO_MONEY = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** Create the college's TPO code (100% off the interview fee, capped at the college's paid seats; refused until a batch is paid). One live code per college. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NO_MONEY();
  const { id } = await ctx.params;
  const db = getDb();
  const [college] = await db.select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [existing] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1);
  if (existing) return NextResponse.json({ error: "This college already has a code" }, { status: 409 });
  // Marking the first batch paid creates the code; creating it by hand before that is refused.
  const paid = await paidSeatTotal(db, id);
  const awaiting = firstPaymentProblem(paid.batches);
  if (awaiting) return NextResponse.json({ error: awaiting }, { status: 409 });
  // Seats come only from paid batches (owner answer Q1): the cap is the paid total.
  const code = await createTpoCode(db, id, paid.seats);
  if (code) {
    await recordAdminAudit(db, { adminId: g.session.uid, action: "college.tpo_code_create", targetType: "college", targetId: id, meta: { code, maxUsages: paid.seats } });
    return NextResponse.json({ ok: true, code });
  }
  return NextResponse.json({ error: "This college already has a code" }, { status: 409 });
}

const patchSchema = z.object({ maxUsages: z.number().int() });

/** Change the cap. The server refuses a cap below the seats already used or above the seats paid for. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NO_MONEY();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number of seats" }, { status: 400 });
  const { id } = await ctx.params;
  const cap = parsed.data.maxUsages;
  const out = await getDb().transaction(async (tx) => {
    // The same college row lock as mark-paid, so a batch paid meanwhile can't be undercut by this edit.
    await tx.select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).for("update");
    const [promo] = await tx.select().from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1);
    if (!promo) return { error: "This college has no code yet", status: 404 };
    // Owner rule: no free seats, so the cap can never exceed the seats paid for.
    const problem = seatCapProblem(cap, promo.usedCount, (await paidSeatTotal(tx, id)).seats);
    if (problem) return { error: problem, status: 400 };
    // Re-checks used_count in the UPDATE itself: a seat taken since the read must not slip under the new cap.
    const rows = await tx
      .update(schema.promoCodes)
      .set({ maxUsages: cap, updatedAt: new Date() })
      .where(sql`${schema.promoCodes.id} = ${promo.id} AND ${schema.promoCodes.usedCount} <= ${cap}`)
      .returning({ id: schema.promoCodes.id });
    if (rows.length === 0) return { error: "Seats were just used; refresh and try again", status: 409 };
    await recordAdminAudit(tx, { adminId: g.session.uid, action: "college.tpo_cap_update", targetType: "college", targetId: id, meta: { maxUsages: { from: promo.maxUsages, to: cap } } });
    return null;
  });
  if (out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true });
}
