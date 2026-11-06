import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { receivedRefusal } from "@/lib/order-received";

/** Accounts marks an order's money as received in the bank (legacy raw.receivedAt). */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [order] = await db.select().from(schema.employerPayments).where(eq(schema.employerPayments.orderId, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const refusal = receivedRefusal(order);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  // The guard is in the UPDATE too, so two admins clicking at once keep the first stamp.
  const stamped = await db
    .update(schema.employerPayments)
    .set({ raw: { ...((order.raw ?? {}) as Record<string, unknown>), receivedAt: new Date().toISOString(), receivedBy: guard.session.email } })
    .where(and(eq(schema.employerPayments.id, order.id), sql`(${schema.employerPayments.raw}->>'receivedAt') is null`))
    .returning({ id: schema.employerPayments.id });
  if (stamped.length === 0) return NextResponse.json({ error: "This order is already marked received." }, { status: 409 });
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "order.marked_received", targetType: "order", targetId: orderId, meta: { employerId: order.employerId, amountMinor: order.amountMinor } });
  return NextResponse.json({ ok: true });
}
