import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { seatBatchAmount, seatBatchProblem } from "@/lib/college/money";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ seats: z.number() });

/** Admin raises a pending seat batch (₹800 per seat, GST included). It adds no seats until marked paid. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const problem = parsed.success ? seatBatchProblem(parsed.data.seats) : "Enter a number of seats.";
  if (!parsed.success || problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  const [college] = await db.select({ isPartner: schema.colleges.isPartner }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!college.isPartner) return NextResponse.json({ error: "Only partner colleges can buy seats" }, { status: 400 });
  const { seats } = parsed.data;
  const amountMinor = seatBatchAmount(seats);
  const [row] = await db
    .insert(schema.collegeSeatBatches)
    .values({ collegeId: id, seats, amountMinor, createdBy: g.session.uid })
    .returning({ id: schema.collegeSeatBatches.id });
  await recordAdminAudit(db, { adminId: g.session.uid, action: "college.seat_batch_create", targetType: "college", targetId: id, meta: { batchId: row.id, seats, amountMinor } });
  return NextResponse.json({ ok: true, id: row.id });
}
