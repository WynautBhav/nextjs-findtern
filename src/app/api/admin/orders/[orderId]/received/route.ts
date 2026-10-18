import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** Accounts marks an order's money as received in the bank (legacy raw.receivedAt). */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [order] = await db.select().from(schema.employerPayments).where(eq(schema.employerPayments.orderId, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  await db
    .update(schema.employerPayments)
    .set({ raw: { ...((order.raw ?? {}) as Record<string, unknown>), receivedAt: new Date().toISOString(), receivedBy: guard.session.email } })
    .where(eq(schema.employerPayments.id, order.id));
  return NextResponse.json({ ok: true });
}
