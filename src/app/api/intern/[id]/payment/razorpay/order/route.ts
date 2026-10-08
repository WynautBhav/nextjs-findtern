import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { getRazorpay } from "@/lib/razorpay";

const BASE_MINOR = 249900; // ₹2,499

const bodySchema = z.object({ promoCode: z.string().trim().min(1).optional() }).partial();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();

  // The amount is always recomputed here. The client may preview a discount,
  // but the only price that matters is the one this route derives from the
  // promo_codes row itself.
  let amountMinor = BASE_MINOR;
  let promo: typeof schema.promoCodes.$inferSelect | null = null;
  let discountMinor = 0;

  if (parsed.data.promoCode) {
    const code = parsed.data.promoCode.toUpperCase();
    const [row] = await db
      .select()
      .from(schema.promoCodes)
      .where(and(eq(schema.promoCodes.code, code), eq(schema.promoCodes.isActive, true)))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Invalid promo code" }, { status: 404 });
    if (row.validFrom && row.validFrom > new Date()) {
      return NextResponse.json({ error: "Promo code is not active yet" }, { status: 400 });
    }
    if (row.validUntil && row.validUntil < new Date()) {
      return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
    }
    if (row.maxUsages && row.usedCount >= row.maxUsages) {
      return NextResponse.json({ error: "Promo code exhausted" }, { status: 400 });
    }
    if (row.minOrderAmountMinor && BASE_MINOR < row.minOrderAmountMinor) {
      return NextResponse.json({ error: "Promo code does not apply to this order" }, { status: 400 });
    }
    const [priorUse] = await db
      .select({ id: schema.promoCodeUsages.id })
      .from(schema.promoCodeUsages)
      .where(and(eq(schema.promoCodeUsages.promoCodeId, row.id), eq(schema.promoCodeUsages.userId, id)))
      .limit(1);
    if (priorUse) {
      return NextResponse.json({ error: "You have already used this code" }, { status: 400 });
    }

    promo = row;
    discountMinor =
      row.discountType === "percentage"
        ? Math.round((BASE_MINOR * row.discountValue) / 100)
        : Math.min(row.discountValue, BASE_MINOR);
    amountMinor = Math.max(0, BASE_MINOR - discountMinor);
  }

  // Full-discount code: no Razorpay order at all. Write the paid row and the
  // usage now, and let the client skip the modal.
  if (amountMinor === 0 && promo) {
    await db.insert(schema.internPayments).values({
      internId: id,
      orderId: `free_${promo.code}_${id}`,
      amountMinor: 0,
      currency: "INR",
      status: "paid",
      paidAt: new Date(),
      raw: { promoCode: promo.code },
    });
    await db.insert(schema.promoCodeUsages).values({
      promoCodeId: promo.id,
      userId: id,
      discountAppliedMinor: discountMinor,
    });
    await db
      .update(schema.promoCodes)
      .set({ usedCount: promo.usedCount + 1, updatedAt: new Date() })
      .where(eq(schema.promoCodes.id, promo.id));
    return NextResponse.json({ free: true });
  }

  try {
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountMinor,
      currency: "INR",
      receipt: `intern_${id}`,
    });
    await db.insert(schema.internPayments).values({
      internId: id,
      orderId: order.id,
      amountMinor,
      currency: "INR",
      status: "created",
      raw: promo ? { promoCode: promo.code, discountMinor } : {},
    });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Razorpay not configured" }, { status: 503 });
  }
}
