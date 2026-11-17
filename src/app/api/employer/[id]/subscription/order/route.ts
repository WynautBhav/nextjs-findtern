import { randomUUID } from "node:crypto";

import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { isFullWaiver, WAIVER_GATEWAY, waiverPromoRaw } from "@/lib/full-waiver";
import { requireMutation } from "@/lib/guards-mutation";
import { expireStaleEmployerOrders, legacyOrderRaw, OPEN_ORDER_MINUTES, settleEmployerOrder } from "@/lib/payments";
import { getEmployerSubscriptionConfig } from "@/lib/platform-settings";
import { promoHoldRefusal, promoRefusal, quotePromoGuarded } from "@/lib/promo";
import { createOrder, paymentsAreFree, razorpayKeyId, testPayEnabled } from "@/lib/razorpay";
import { reusableOpenOrder, subscriptionCurrency, subscriptionListMinor, subscriptionNotes, subscriptionRawBase, type SubscriptionCurrency } from "@/lib/subscription/order";

const bodySchema = z.object(
  {
    promoCode: z.string({ error: "Enter a valid promo code." }).trim().min(1, "Enter a valid promo code.").optional(),
    /** Price the code and answer; create nothing. What the page's Apply button calls. */
    preview: z.boolean().optional(),
    /** e2e only: settle at the real amount without Razorpay. Refused with 403 unless testPayEnabled() (test hosts only). */
    testPay: z.boolean().optional(),
  },
  { error: "Something is wrong with this request. Refresh the page and try again." },
);

type Db = ReturnType<typeof getDb>;
type OrderRow = typeof schema.employerPayments.$inferInsert;
type Open = { orderId: string; amountMinor: number; currency: string };

/** The employer's unpaid orders from the last 30 minutes, newest first. */
async function recentOrders(q: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], employerId: string) {
  return q
    .select({ orderId: schema.employerPayments.orderId, status: schema.employerPayments.status, createdAt: schema.employerPayments.createdAt, amountMinor: schema.employerPayments.amountMinor, currency: schema.employerPayments.currency, gateway: schema.employerPayments.gateway, raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(and(eq(schema.employerPayments.employerId, employerId), eq(schema.employerPayments.status, "created"), gte(schema.employerPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000))))
    .orderBy(desc(schema.employerPayments.createdAt));
}

const reuse = (rows: Awaited<ReturnType<typeof recentOrders>>, promoCode: string | null, currency: SubscriptionCurrency): Open | null =>
  reusableOpenOrder(rows, { promoCode, currency, now: new Date(), openMinutes: OPEN_ORDER_MINUTES });

/**
 * Check and insert as one step per employer (the same advisory lock the hiring checkout takes), so a double click or a
 * second tab cannot open two orders. An unpaid subscription order for the same code and currency is returned as it is;
 * any other unpaid subscription order is closed first, so the employer is never left with two live checkouts. An order that
 * settles in the same request (waiver, test host) never reuses one. A capped code
 * whose last uses sit on other accounts' open payments is refused (consume on paid, hold while open).
 */
async function openOrder(employerId: string, row: OrderRow, promoCode: string | null, currency: SubscriptionCurrency, canReuse = true): Promise<{ open: Open } | { refused: string } | null> {
  return withLock(`employer-pay:${employerId}`, async (tx) => {
    const recent = await recentOrders(tx, employerId);
    const again = canReuse ? reuse(recent, promoCode, currency) : null;
    if (again) return { open: again };
    if (promoCode) {
      const held = await promoHoldRefusal(tx, promoCode, employerId);
      if (held) return { refused: held };
    }
    for (const r of recent) {
      if ((r.raw as { kind?: string } | null)?.kind !== "employer_subscription") continue;
      await tx
        .update(schema.employerPayments)
        .set({ status: "failed" })
        .where(and(eq(schema.employerPayments.orderId, r.orderId), eq(schema.employerPayments.employerId, employerId), eq(schema.employerPayments.status, "created")));
    }
    await tx.insert(schema.employerPayments).values(row);
    return null;
  });
}

/** An order that never settles is closed, or it would block the next try for 30 minutes. The status guard leaves one alone once it has been paid. */
function closeOrder(employerId: string, orderId: string) {
  return getDb()
    .update(schema.employerPayments)
    .set({ status: "failed" })
    .where(and(eq(schema.employerPayments.orderId, orderId), eq(schema.employerPayments.employerId, employerId), eq(schema.employerPayments.status, "created")));
}

/**
 * Buy Findtern Pro: the subscription as an `employer_payments` row (`raw.kind = "employer_subscription"`), no proposals.
 * The price, length and currency come from the server (platform settings and the employer's country), never from the request.
 * Settlement is the one the hiring checkout uses (`settleEmployerOrder`): it marks the row paid, takes the invoice number,
 * records the promo use, and hires nobody. Employer-level, not project-scoped, so the takedown guard does not apply.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { promoCode, preview } = parsed.data;
  if (parsed.data.testPay && !testPayEnabled()) return NextResponse.json({ error: "Test payments are off" }, { status: 403 });

  const config = await getEmployerSubscriptionConfig();
  if (!config.enabled) return NextResponse.json({ error: "Findtern Pro is not on sale right now." }, { status: 409 });

  const db = getDb();
  const [employer] = await db
    .select({ country: schema.employers.country, countryCode: schema.employers.countryCode, phoneNumber: schema.employers.phoneNumber })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  if (!employer) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const currency = subscriptionCurrency(employer);
  const listMinor = subscriptionListMinor(config, currency);
  const periodDays = config.durationDays;

  // The code is priced on the whole price (nothing in a subscription is undiscountable); only a code scoped "subscription" passes.
  let amountMinor = listMinor;
  let promo: { promoCode: string; discountMinor: number } | null = null;
  let waiver: ReturnType<typeof waiverPromoRaw> | null = null;
  if (promoCode) {
    const quote = await quotePromoGuarded(req, id, { code: promoCode, subjectId: id, orderMinor: listMinor, currency, audience: "subscription" }, { redeem: !preview });
    if (!quote.ok) return promoRefusal(quote);
    promo = { promoCode: quote.promo.code, discountMinor: quote.discountMinor };
    if (isFullWaiver(quote.promo)) waiver = waiverPromoRaw({ code: quote.promo.code, promoCodeId: quote.promo.id, waivedMinor: quote.discountMinor });
    amountMinor = quote.payableMinor;
  }
  if (preview) {
    return NextResponse.json({ currency, listMinor, ...(promo ? { code: promo.promoCode, discountMinor: promo.discountMinor, payableMinor: amountMinor } : {}), ...(waiver ? { fullWaiver: true } : {}) });
  }
  if (amountMinor <= 0 && !waiver) return NextResponse.json({ error: "Nothing payable" }, { status: 400 });

  await expireStaleEmployerOrders(id);
  const notes = subscriptionNotes({
    employerId: id,
    periodDays,
    listMinor,
    amountMinor,
    discountMinor: promo?.discountMinor ?? 0,
    computedAmountMinor: paymentsAreFree() && !parsed.data.testPay && !waiver ? 0 : amountMinor,
  });
  const base = subscriptionRawBase({ periodDays, currency });
  const settleNow = async (row: OrderRow, orderId: string, extra: Record<string, unknown>) => {
    const outcome = await openOrder(id, row, promo?.promoCode ?? null, currency, false);
    if (outcome && "refused" in outcome) return NextResponse.json({ error: outcome.refused }, { status: 409 });
    const settled = await settleEmployerOrder({ orderId, paymentId: orderId, employerId: id }).catch(async (e) => {
      await closeOrder(id, orderId);
      throw e;
    });
    if (!settled.ok) {
      await closeOrder(id, orderId);
      return NextResponse.json({ error: settled.error }, { status: settled.status });
    }
    return NextResponse.json({ free: true, ...extra });
  };

  // Full waiver: nothing to pay, so no Razorpay order and no popup. Recorded and settled at once through the same settlement,
  // which locks the code, consumes its use once and audits it. No invoice number is taken (amount 0).
  if (waiver) {
    const orderId = `waiver_${randomUUID()}`;
    return settleNow(
      { employerId: id, gateway: WAIVER_GATEWAY, orderId, amountMinor: 0, currency, status: "created", raw: { ...base, notes, order: legacyOrderRaw({ id: orderId, amountMinor: 0, currency, notes }), promo: waiver } },
      orderId,
      { waived: true },
    );
  }

  // Test host: record and settle straight away, as a real payment would (free mode charges 0; testPay keeps the real amount).
  if (paymentsAreFree() || parsed.data.testPay) {
    const testPay = Boolean(parsed.data.testPay);
    const charged = testPay ? amountMinor : 0;
    const orderId = `${testPay ? "test" : "free_test"}_${randomUUID()}`;
    return settleNow(
      { employerId: id, gateway: testPay ? "test" : "free", orderId, amountMinor: charged, currency, status: "created", raw: { ...base, notes, order: legacyOrderRaw({ id: orderId, amountMinor: charged, currency, notes }), testMode: true, ...(promo ? { promo } : {}) } },
      orderId,
      {},
    );
  }

  try {
    // A double click, a reload or a second tab gets the order that is already open, with no second gateway call.
    const early = reuse(await recentOrders(db, id), promo?.promoCode ?? null, currency);
    if (early) return NextResponse.json({ orderId: early.orderId, amount: early.amountMinor, currency: early.currency, keyId: razorpayKeyId(), reused: true });
    // The gateway call comes first, outside the lock. A request that loses the race leaves a Razorpay order nobody pays, which costs nothing.
    const order = await createOrder({ amountMinor, currency, receipt: `sub_${id.slice(0, 8)}_${Date.now().toString(36)}`, notes });
    const outcome = await openOrder(id, { employerId: id, orderId: order.id, amountMinor, currency, status: "created", raw: { ...base, notes, order: legacyOrderRaw({ id: order.id, amountMinor, currency, notes }), ...(promo ? { promo } : {}) } }, promo?.promoCode ?? null, currency);
    if (outcome && "refused" in outcome) return NextResponse.json({ error: outcome.refused }, { status: 409 });
    if (outcome && "open" in outcome) return NextResponse.json({ orderId: outcome.open.orderId, amount: outcome.open.amountMinor, currency: outcome.open.currency, keyId: razorpayKeyId(), reused: true });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency, keyId: razorpayKeyId() });
  } catch (e: unknown) {
    console.error("[employer/subscription/order]", e);
    return NextResponse.json({ error: "Payments are unavailable right now. Try again shortly." }, { status: 503 });
  }
}
