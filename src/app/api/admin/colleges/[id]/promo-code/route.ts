import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { createTpoCode } from "@/lib/college/tpo-code";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { seatCapProblem } from "@/lib/promo-rules";

type Ctx = { params: Promise<{ id: string }> };

/** A discount code, so it also needs money permission on top of the college write the path rule asks for. */
const NO_MONEY = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** Create the college's TPO code (100% off the interview fee, 0 seats until a batch is paid). One live code per college. */
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
  // Cap 0: seats come only from paid batches (owner answer Q1).
  const code = await createTpoCode(db, id, 0);
  if (code) {
    await recordAdminAudit(db, { adminId: g.session.uid, action: "college.tpo_code_create", targetType: "college", targetId: id, meta: { code, maxUsages: 0 } });
    return NextResponse.json({ ok: true, code });
  }
  return NextResponse.json({ error: "This college already has a code" }, { status: 409 });
}

const patchSchema = z.object({ maxUsages: z.number().int() });

/** Change the cap. The server refuses a cap below the seats already used. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NO_MONEY();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number of seats" }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  const [promo] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1);
  if (!promo) return NextResponse.json({ error: "This college has no code yet" }, { status: 404 });
  const problem = seatCapProblem(parsed.data.maxUsages, promo.usedCount);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  // Re-checks used_count in the UPDATE itself: a seat taken since the read must not slip under the new cap.
  const rows = await db
    .update(schema.promoCodes)
    .set({ maxUsages: parsed.data.maxUsages, updatedAt: new Date() })
    .where(sql`${schema.promoCodes.id} = ${promo.id} AND ${schema.promoCodes.usedCount} <= ${parsed.data.maxUsages}`)
    .returning({ id: schema.promoCodes.id });
  if (rows.length === 0) return NextResponse.json({ error: "Seats were just used; refresh and try again" }, { status: 409 });
  await recordAdminAudit(db, { adminId: g.session.uid, action: "college.tpo_cap_update", targetType: "college", targetId: id, meta: { maxUsages: { from: promo.maxUsages, to: parsed.data.maxUsages } } });
  return NextResponse.json({ ok: true });
}
