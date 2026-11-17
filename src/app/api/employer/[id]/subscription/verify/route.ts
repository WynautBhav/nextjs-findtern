import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { isSubscriptionOrderRaw } from "@/lib/employer-subscription";
import { requireMutation } from "@/lib/guards-mutation";
import { settleEmployerOrder } from "@/lib/payments";
import { fetchGatewayPaid, verifySignature } from "@/lib/razorpay";

const bodySchema = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });

/**
 * The checkout callback for a Findtern Pro order: same signature check and same settlement as a hire payment (the webhook
 * settles an order whose callback never arrives, through the same function, and a repeat of either is a harmless replay).
 * Only this employer's own subscription order is accepted here: another company's order, or a hire order, answers 404.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [order] = await getDb()
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(and(eq(schema.employerPayments.orderId, parsed.data.orderId), eq(schema.employerPayments.employerId, id)))
    .limit(1);
  if (!order || !isSubscriptionOrderRaw(order.raw)) return NextResponse.json({ error: "Unknown order" }, { status: 404 });

  if (!verifySignature(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature)) {
    // Close it as failed so the open order doesn't block a retry for 30 minutes. A real capture still settles later through the webhook.
    await getDb()
      .update(schema.employerPayments)
      .set({ status: "failed" })
      .where(and(eq(schema.employerPayments.orderId, parsed.data.orderId), eq(schema.employerPayments.employerId, id), eq(schema.employerPayments.status, "created")));
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The signature covers the ids, not the amount: ask Razorpay what it took and let settle compare it with the order's own.
  const paid = (await fetchGatewayPaid(parsed.data.orderId, parsed.data.paymentId)) ?? undefined;
  const result = await settleEmployerOrder({ ...parsed.data, employerId: id, paid });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
