import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { mailCollegeOfficers } from "@/lib/college/mail";
import { paidTransition } from "@/lib/college/seat-paid";
import { shouldRaiseSeatCap } from "@/lib/drives/admin-rules";
import { createTpoCode } from "@/lib/college/tpo-code";
import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { assignInvoiceNumber } from "@/lib/invoice-number";

type Ctx = { params: Promise<{ id: string; batchId: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid"), method: z.enum(["bank", "upi", "cheque"]), referenceId: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("void") }),
]);

/** Mark a seat batch paid (raises the TPO code's cap once, issues the invoice number) or void a pending one. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose bank, UPI or cheque and enter a reference (1 to 64 characters)." }, { status: 400 });
  const body = parsed.data;
  const { id, batchId } = await ctx.params;
  const db = getDb();
  const B = schema.collegeSeatBatches;
  const mine = and(eq(B.id, batchId), eq(B.collegeId, id));

  const conflict = async () => {
    const [b] = await db.select({ status: B.status }).from(B).where(mine).limit(1);
    return b
      ? NextResponse.json({ error: `This batch is already ${b.status}.` }, { status: 409 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  };

  if (body.action === "void") {
    const rows = await db.update(B).set({ status: "void" }).where(and(mine, eq(B.status, "pending"))).returning({ seats: B.seats });
    if (rows.length === 0) return conflict();
    await recordAdminAudit(db, { adminId: g.session.uid, action: "college.seat_batch_void", targetType: "college", targetId: id, meta: { batchId, seats: rows[0].seats } });
    return NextResponse.json({ ok: true });
  }

  const paidAt = new Date();
  const out = await db.transaction(async (tx) => {
    // Serialises batches of one college: the paid-seat sum and the cap read below stay true until commit.
    await tx.select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).for("update");
    const [batch] = await tx
      .update(B)
      .set({ status: "paid", method: body.method, referenceId: body.referenceId, paidAt })
      .where(and(mine, eq(B.status, "pending")))
      .returning({ seats: B.seats, amountMinor: B.amountMinor, driveOrderId: B.driveOrderId });
    if (!batch) return null; // lost the race, or void/unknown: nothing was changed
    // A batch that backs a drive order is paid through /api/admin/drive-orders and never raises the college seat cap.
    const raise = shouldRaiseSeatCap(batch);
    const invoiceNumber = await assignInvoiceNumber("college", batchId, paidAt, tx);
    let cap: number | null = null;
    if (raise) {
      const [{ before }] = await tx
        .select({ before: sql<number>`coalesce(sum(${B.seats}), 0)::int` })
        .from(B)
        .where(and(eq(B.collegeId, id), eq(B.status, "paid"), ne(B.id, batchId), isNull(B.driveOrderId)));
      const [promo] = await tx.select({ id: schema.promoCodes.id, cap: schema.promoCodes.maxUsages }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1);
      const t = paidTransition({ status: "pending", cap: promo?.cap, paidSeatsBefore: before, seats: batch.seats });
      if (!t.ok) throw new Error("unreachable: batch was pending");
      if (promo) {
        // used_count <= cap always holds (the cap never drops here); kept so the invariant is enforced by the row, not by this reading.
        await tx.update(schema.promoCodes).set({ maxUsages: t.cap, updatedAt: new Date() }).where(sql`${schema.promoCodes.id} = ${promo.id} AND ${schema.promoCodes.usedCount} <= ${t.cap}`);
      } else if (!(await createTpoCode(tx, id, t.cap))) {
        throw new Error("could not create the TPO code");
      }
      cap = t.cap;
    }
    await recordAdminAudit(tx, { adminId: g.session.uid, action: "college.seat_batch_paid", targetType: "college", targetId: id, meta: { batchId, seats: batch.seats, method: body.method, referenceId: body.referenceId, invoiceNumber, capAfter: cap } }, { strict: true });
    return { cap, seats: batch.seats, amountMinor: batch.amountMinor };
  });
  if (!out) return conflict();

  if (out.cap === null) return NextResponse.json({ ok: true, cap: null }); // drive-order batch: no cap, no seat-code mail

  const [college] = await db.select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  await mailCollegeOfficers(id, emails.collegeSeatsPaid({ collegeName: college?.name ?? "your college", seats: out.seats, amount: formatMoney(out.amountMinor, "INR", { zeroLabel: false }), cap: out.cap }));
  return NextResponse.json({ ok: true, cap: out.cap });
}
