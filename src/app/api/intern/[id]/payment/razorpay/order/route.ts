import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { quotePromo, recordPromoUse } from "@/lib/promo";
import { isInternPaid, markInternPaidFlag } from "@/lib/payments";
import { internProfileStatus } from "@/lib/profile-complete";
import { createOrder, paymentsAreFree, razorpayKeyId } from "@/lib/razorpay";

const bodySchema = z.object({ promoCode: z.string().trim().min(1).optional() }).partial();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;
  if (await isInternPaid(id)) {
    return NextResponse.json({ error: "Your profile is already activated.", alreadyPaid: true }, { status: 409 });
  }

  // Profile first, then payment (dashboard order, now enforced here too).
  const profile = await internProfileStatus(id);
  if (!profile.complete) {
    const missing = profile.items.filter((i) => !i.done).map((i) => i.label);
    return NextResponse.json(
      { error: `Complete your profile before paying. Still needed: ${missing.join(", ")}.`, missing },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const baseMinor = await getInternActivationFeeMinor();

  // The amount is always recomputed here. The client may preview a discount,
  // but the only price that matters is the one this route derives from the
  // promo_codes row itself.
  let amountMinor = baseMinor;
  let promo: { code: string } | null = null;
  let discountMinor = 0;

  if (parsed.data.promoCode) {
    const quote = await quotePromo({
      code: parsed.data.promoCode,
      subjectId: id,
      orderMinor: baseMinor,
      currency: "INR",
    });
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
    promo = quote.promo;
    discountMinor = quote.discountMinor;
    amountMinor = quote.payableMinor;
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
    await recordPromoUse({
      code: promo.code,
      subjectId: id,
      orderId: `free_${promo.code}_${id}`,
      discountMinor,
    });
    await markInternPaidFlag(id, { orderId: `free_${promo.code}_${id}` });
    return NextResponse.json({ free: true });
  }

  // Test mode: activation is free and nothing goes to Razorpay.
  if (paymentsAreFree()) {
    const orderId = `free_test_${id}`;
    await db
      .insert(schema.internPayments)
      .values({
        internId: id,
        gateway: "free",
        orderId,
        amountMinor: 0,
        currency: "INR",
        status: "paid",
        paidAt: new Date(),
        raw: { testMode: true },
      })
      .onConflictDoNothing();
    await markInternPaidFlag(id, { orderId });
    return NextResponse.json({ free: true });
  }

  try {
    const order = await createOrder({
      amountMinor,
      currency: "INR",
      receipt: `intern_${id.slice(0, 8)}_${Date.now().toString(36)}`,
      notes: { internId: id, purpose: "intern_activation" },
    });
    await db.insert(schema.internPayments).values({
      internId: id,
      orderId: order.id,
      amountMinor,
      currency: "INR",
      status: "created",
      raw: promo ? { promoCode: promo.code, discountMinor } : {},
    });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency: "INR", keyId: razorpayKeyId() });
  } catch (e: unknown) {
    console.error("[intern/payment/razorpay/order]", e);
    return NextResponse.json({ error: "Payments are unavailable right now. Try again shortly." }, { status: 503 });
  }
}
