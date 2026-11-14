import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { collegeAccountPayBlock } from "@/lib/college/account-state";
import { openOrder } from "@/lib/intern-order-open";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { consentProblem } from "@/lib/college/promo-membership";
import { quotePromo } from "@/lib/promo";
import { isInternPaid, settleInternOrder } from "@/lib/payments";
import { internProfileStatus } from "@/lib/profile-complete";
import { createOrder, paymentsAreFree, razorpayKeyId, testPayEnabled } from "@/lib/razorpay";

const bodySchema = z.object({ promoCode: z.string().trim().min(1).optional(), testPay: z.boolean().optional(), declaredAdult: z.boolean().optional() }).partial();

function refusal(r: { error: string; alreadyPaid?: true }) {
  return NextResponse.json(r, { status: 409 });
}

/** Close an order that never settled, so it stops counting as in progress and the next try starts clean. */
async function closeOrder(internId: string, orderId: string) {
  await getDb()
    .update(schema.internPayments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(schema.internPayments.orderId, orderId), eq(schema.internPayments.internId, internId), eq(schema.internPayments.status, "created")));
}

/** Record an order that needs no gateway and settle it through the real settlement (invoice number, promo use, notification). */
async function settleNow(internId: string, row: typeof schema.internPayments.$inferInsert & { orderId: string }) {
  const refused = await openOrder(internId, row);
  if (refused) return "error" in refused ? refusal(refused) : NextResponse.json({ error: "A payment is already open. Give it a moment, then refresh." }, { status: 409 });
  // The status guard in closeOrder leaves an order alone once it has been paid.
  const settled = await settleInternOrder({ orderId: row.orderId, paymentId: row.orderId, internId }).catch(async (e) => {
    await closeOrder(internId, row.orderId);
    throw e;
  });
  if (!settled.ok) {
    await closeOrder(internId, row.orderId);
    return NextResponse.json({ error: settled.error }, { status: settled.status });
  }
  return NextResponse.json({ free: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;
  if (await isInternPaid(id)) {
    return NextResponse.json({ error: "Your profile is already activated.", alreadyPaid: true }, { status: 409 });
  }

  // A college account's fee is its college's to pay (promo field on Home); to pay for themselves they switch to an individual account.
  const blocked = await collegeAccountPayBlock(id);
  if (blocked) return blocked;

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
  if (parsed.data.testPay && !testPayEnabled()) return NextResponse.json({ error: "Test payments are off" }, { status: 403 });

  const baseMinor = await getInternActivationFeeMinor();

  // The amount is always recomputed here. The client may preview a discount,
  // but the only price that matters is the one this route derives from the
  // promo_codes row itself.
  let amountMinor = baseMinor;
  let promo: { code: string; collegeId: string | null } | null = null;
  let discountMinor = 0;

  if (parsed.data.promoCode) {
    const quote = await quotePromo({
      code: parsed.data.promoCode,
      subjectId: id,
      orderMinor: baseMinor,
      currency: "INR",
    });
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
    // A college code verifies the student with that college, so the 18+ tick is required with it.
    const noConsent = quote.promo.collegeId ? consentProblem(parsed.data.declaredAdult) : null;
    if (noConsent) return NextResponse.json({ error: noConsent, needsConsent: true }, { status: 400 });
    promo = quote.promo;
    discountMinor = quote.discountMinor;
    amountMinor = quote.payableMinor;
  }
  const raw = promo ? { promoCode: promo.code, discountMinor, ...(promo.collegeId ? { declaredAdult: true } : {}) } : {};

  // Full-discount code: no Razorpay order at all. Settle it now and let the
  // client skip the modal.
  if (amountMinor === 0 && promo) {
    return settleNow(id, {
      internId: id,
      orderId: `free_${promo.code}_${id}_${randomUUID().slice(0, 8)}`,
      gateway: "free",
      amountMinor: 0,
      currency: "INR",
      status: "created",
      raw,
    });
  }

  // The testPay flag (already checked against testPayEnabled() above): the real amount through the
  // real settlement (invoice number, promo use, notification), no Razorpay.
  if (parsed.data.testPay) {
    return settleNow(id, { internId: id, orderId: `test_${randomUUID()}`, gateway: "test", amountMinor, currency: "INR", status: "created", raw });
  }

  // Test mode: activation is free and nothing goes to Razorpay.
  if (paymentsAreFree()) {
    return settleNow(id, {
      internId: id,
      orderId: `free_test_${id}_${randomUUID().slice(0, 8)}`,
      gateway: "free",
      amountMinor: 0,
      currency: "INR",
      status: "created",
      raw: { testMode: true },
    });
  }

  try {
    // The gateway call comes first, outside the lock. A request that loses the
    // race leaves a Razorpay order nobody pays, which costs nothing.
    const order = await createOrder({
      amountMinor,
      currency: "INR",
      receipt: `intern_${id.slice(0, 8)}_${Date.now().toString(36)}`,
      notes: { internId: id, purpose: "intern_activation" },
    });
    const refused = await openOrder(id, { internId: id, orderId: order.id, amountMinor, currency: "INR", status: "created", raw });
    if (refused && "reuse" in refused) {
      return NextResponse.json({ orderId: refused.reuse, amount: amountMinor, currency: "INR", keyId: razorpayKeyId() });
    }
    if (refused) return refusal(refused);
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency: "INR", keyId: razorpayKeyId() });
  } catch (e: unknown) {
    console.error("[intern/payment/razorpay/order]", e);
    return NextResponse.json({ error: "Payments are unavailable right now. Try again shortly." }, { status: 503 });
  }
}
