import { randomUUID } from "node:crypto";

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { quotePromo } from "@/lib/promo";
import { isInternPaid, settleInternOrder } from "@/lib/payments";
import { internProfileStatus } from "@/lib/profile-complete";
import { createOrder, paymentsAreFree, razorpayKeyId, testPayEnabled } from "@/lib/razorpay";

const bodySchema = z.object({ promoCode: z.string().trim().min(1).optional(), testPay: z.boolean().optional() }).partial();

/** How long an order that settles on the spot (test, free, full promo) counts as still being completed. */
const SETTLING_MINUTES = 5;

/** How long an unpaid Razorpay order stays open for a retry (matches the employer side). */
const OPEN_ORDER_MINUTES = 30;

type Opened = { error: string; alreadyPaid?: true } | { reuse: string } | null;

/**
 * Check and insert as one step per intern, so two requests at once (a double
 * click, two tabs) can't both pass the paid check and open two orders, each
 * with its own invoice. Only database work runs inside the lock, on `tx`: a
 * second pool connection or a gateway call here would hold the lock while
 * waiting. Returns the refusal, or null once the order row is in.
 */
async function openOrder(internId: string, row: typeof schema.internPayments.$inferInsert): Promise<Opened> {
  return withLock(`intern-pay:${internId}`, async (tx): Promise<Opened> => {
    if (await isInternPaid(internId, tx)) return { error: "Your profile is already activated.", alreadyPaid: true as const };
    // Razorpay checkouts for this fee still open (a second tab, a double click, or
    // the modal closed and Pay pressed again). The same request (same amount, same
    // code) is handed the order already open, so both tabs can be paid only once.
    // A different one (a code applied since) replaces the older, which is closed,
    // so only one order is ever live.
    if (!row.gateway || row.gateway === "razorpay") {
      const openOrders = await tx
        .select({ id: schema.internPayments.id, orderId: schema.internPayments.orderId, amountMinor: schema.internPayments.amountMinor, raw: schema.internPayments.raw })
        .from(schema.internPayments)
        .where(
          and(
            eq(schema.internPayments.internId, internId),
            eq(schema.internPayments.status, "created"),
            eq(schema.internPayments.gateway, "razorpay"),
            gte(schema.internPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
          ),
        )
        .orderBy(asc(schema.internPayments.createdAt));
      const codeOf = (raw: unknown) => String((raw as { promoCode?: unknown } | null)?.promoCode ?? "");
      const same = openOrders.find((o) => o.amountMinor === (row.amountMinor ?? 0) && codeOf(o.raw) === codeOf(row.raw));
      if (same) return { reuse: same.orderId };
      if (openOrders.length > 0) {
        await tx
          .update(schema.internPayments)
          .set({ status: "failed", updatedAt: new Date() })
          .where(inArray(schema.internPayments.id, openOrders.map((o) => o.id)));
      }
    }
    // Orders that settle on the spot are inserted, then settled after the lock
    // is released; one still in that gap must not be joined by a second.
    if (row.gateway === "test" || row.gateway === "free") {
      const [settling] = await tx
        .select({ id: schema.internPayments.id })
        .from(schema.internPayments)
        .where(
          and(
            eq(schema.internPayments.internId, internId),
            eq(schema.internPayments.status, "created"),
            inArray(schema.internPayments.gateway, ["test", "free"]),
            gte(schema.internPayments.createdAt, new Date(Date.now() - SETTLING_MINUTES * 60_000)),
          ),
        )
        .limit(1);
      if (settling) return { error: "A payment is already being completed. Give it a moment, then refresh." };
    }
    await tx.insert(schema.internPayments).values(row);
    return null;
  });
}

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
  const raw = promo ? { promoCode: promo.code, discountMinor } : {};

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

  // The test button (PAYMENTS_TEST_BUTTON=1): the real amount through the
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
