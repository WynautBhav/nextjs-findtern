import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { verifySignature } from "@/lib/razorpay";

const bodySchema = z.object({
  orderId: z.string(),
  paymentId: z.string(),
  signature: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (!verifySignature(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(schema.internPayments)
    .where(and(eq(schema.internPayments.orderId, parsed.data.orderId), eq(schema.internPayments.internId, id)))
    .limit(1);
  if (!payment) return NextResponse.json({ error: "Unknown order" }, { status: 404 });

  await db
    .update(schema.internPayments)
    .set({ paymentId: parsed.data.paymentId, signature: parsed.data.signature, status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.internPayments.id, payment.id));

  // A promo used on this order is recorded now that the money is real —
  // recording at order-creation would burn the code on abandoned checkouts.
  const promoCode = (payment.raw as { promoCode?: string } | null)?.promoCode;
  if (promoCode) {
    const [promo] = await db
      .select()
      .from(schema.promoCodes)
      .where(eq(schema.promoCodes.code, promoCode))
      .limit(1);
    if (promo) {
      const [priorUse] = await db
        .select({ id: schema.promoCodeUsages.id })
        .from(schema.promoCodeUsages)
        .where(and(eq(schema.promoCodeUsages.promoCodeId, promo.id), eq(schema.promoCodeUsages.userId, id)))
        .limit(1);
      if (!priorUse) {
        await db.insert(schema.promoCodeUsages).values({
          promoCodeId: promo.id,
          userId: id,
          orderId: parsed.data.orderId,
          discountAppliedMinor: (payment.raw as { discountMinor?: number } | null)?.discountMinor ?? 0,
        });
        await db
          .update(schema.promoCodes)
          .set({ usedCount: promo.usedCount + 1, updatedAt: new Date() })
          .where(eq(schema.promoCodes.id, promo.id));
      }
    }
  }

  return NextResponse.json({ ok: true });
}
