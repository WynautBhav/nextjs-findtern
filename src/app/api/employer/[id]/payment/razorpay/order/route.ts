import { randomUUID } from "node:crypto";

import { and, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock, type Tx } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { paymentIndexMismatch } from "@/lib/dues";
import { requireMutation } from "@/lib/guards-mutation";
import { openProposalsWithDues, payableCheckout, type PayableLine } from "@/lib/employer-payable";
import { expireStaleEmployerOrders, legacyOrderRaw, OPEN_ORDER_MINUTES, orderProposalIds, settleEmployerOrder } from "@/lib/payments";
import { quotePromo } from "@/lib/promo";
import { promoModeProblem } from "@/lib/promo-rules";
import { createOrder, paymentsAreFree, razorpayKeyId, testPayEnabled } from "@/lib/razorpay";

const bodySchema = z.object({
  currency: z.enum(["INR", "USD"], { error: "Pick INR or USD." }).default("INR"),
  /** One hire per payment (legacy checkout). */
  proposalIds: z.array(z.string().min(1), { error: "Pay for one hire at a time" }).length(1, "Pay for one hire at a time"),
  /** How a new hire is paid; a running monthly placement always pays its due month. */
  mode: z.enum(["upfront", "monthly"], { error: "Choose to pay upfront or monthly." }).default("upfront"),
  /** The month being paid: payments already made for this hire (0 = first). A stale second submit names a month that is already paid. */
  paymentIndex: z.number({ error: "This page is out of date. Refresh and try again." }).int().min(0),
  promoCode: z.string({ error: "Enter a valid promo code." }).trim().min(1, "Enter a valid promo code.").optional(),
  /** The test button (PAYMENTS_TEST_BUTTON=1): settle at the real amount without Razorpay. */
  testPay: z.boolean().optional(),
}, { error: "Something is wrong with this payment request. Refresh the page and try again." });

type Db = ReturnType<typeof getDb>;

/**
 * Why a new order can't open right now, or null. An unpaid order from the last
 * 30 minutes already covers one of these: finish or close that one first, so
 * the same hire, or the same due month from a second tab (EMH-26), can't be
 * paid twice. A use of a promo code is recorded only when an order is paid, so
 * an open order already holding the code would let a one-time code discount
 * two hires. Runs on the db for a quick refusal, and again on the locking
 * transaction in `openOrder`.
 */
async function openConflict(q: Db | Tx, employerId: string, proposalIds: string[], promoCode?: string): Promise<string | null> {
  const since = new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000);
  const recent = await q
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(and(eq(schema.employerPayments.employerId, employerId), eq(schema.employerPayments.status, "created"), gte(schema.employerPayments.createdAt, since)));
  const busy = new Set(recent.flatMap((r) => orderProposalIds(r.raw)));
  // EMH-35: "processing" is legacy's mark for an offer whose checkout is
  // open on the legacy site; a recent one is a payment in flight there.
  const inFlight = await q
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, employerId),
        inArray(schema.proposals.id, proposalIds),
        eq(schema.proposals.status, "processing"),
        gte(schema.proposals.updatedAt, since),
      ),
    );
  if (proposalIds.some((pid) => busy.has(pid)) || inFlight.length > 0) {
    return "A payment for this is already open. Finish it or wait a few minutes.";
  }
  if (promoCode && recent.some((r) => (r.raw as { promo?: { promoCode?: string } } | null)?.promo?.promoCode === promoCode)) {
    return "This code is on a payment that's still open. Finish that payment, or wait 30 minutes for it to close.";
  }
  return null;
}

/**
 * Check and insert as one step per employer, so two requests at once (a double
 * click, two tabs) can't both pass the check and open two orders. Only database
 * work runs inside the lock, on `tx`: a second pool connection or a gateway
 * call here would hold the lock while waiting. Returns the refusal, or null
 * once the order row is in.
 */
async function openOrder(
  employerId: string,
  paying: PayableLine[],
  promoCode: string | undefined,
  row: typeof schema.employerPayments.$inferInsert,
): Promise<string | null> {
  return withLock(`employer-pay:${employerId}`, async (tx) => {
    const conflict = await openConflict(tx, employerId, paying.map((l) => l.id), promoCode);
    if (conflict) return conflict;
    // The offers were priced before the lock. A request ahead of this one may
    // have paid them since (they read paid, not open), so confirm each is still
    // what was owed: an accepted hire, or the same month due as when priced.
    const { open, dues } = await openProposalsWithDues(tx, employerId);
    const alreadyPaid = paying.some((l) =>
      l.due
        ? dues.get(l.id)?.monthsPaid !== l.due.monthsPaid
        : !open.some((p) => p.id === l.id && (p.status === "accepted" || p.status === "processing")),
    );
    if (alreadyPaid) return "This was already paid. Refresh the page to see it under Orders.";
    await tx.insert(schema.employerPayments).values(row);
    return null;
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { currency } = parsed.data;
  if (parsed.data.testPay && !testPayEnabled()) return NextResponse.json({ error: "Test payments are off" }, { status: 403 });

  // Amount is recomputed from the accepted offers; the client never sends it.
  const { lines } = await payableCheckout(id, { proposalIds: parsed.data.proposalIds, mode: parsed.data.mode });
  const paying = lines.filter((l) => l.currency === currency);
  if (paying.length === 0) return NextResponse.json({ error: "There is nothing to pay on this offer right now. Refresh the page." }, { status: 400 });
  // Never re-price a repeat submit as the next month: refuse when the month asked for is not the one due.
  if (paymentIndexMismatch(paying, parsed.data.paymentIndex)) {
    return NextResponse.json({ error: "This month is already paid. Refresh the page to see it under Orders." }, { status: 409 });
  }
  if (parsed.data.mode === "monthly" && paying.some((l) => !l.due && l.charge.monthlyBlocked)) {
    return NextResponse.json({ error: paying.find((l) => l.charge.monthlyBlocked)!.charge.monthlyBlocked }, { status: 400 });
  }
  // A due month is monthly whatever was asked; dues.ts counts these orders.
  const mode = paying.some((l) => l.due) ? "monthly" : parsed.data.mode;
  // Promo codes are for upfront payment only (3 Nov 2026), whatever the client asked.
  if (parsed.data.promoCode) {
    const modeProblem = promoModeProblem(mode);
    if (modeProblem) return NextResponse.json({ error: modeProblem }, { status: 400 });
  }

  if (paying.some((l) => l.charge.totalMinor <= 0)) {
    return NextResponse.json({ error: "One of these offers has no amount to pay. Edit it before checking out." }, { status: 400 });
  }
  // Abandoned orders older than 30 minutes close as "failed" (DB-05), for
  // every company: one small UPDATE, and nobody else sweeps them.
  await expireStaleEmployerOrders();
  // The quick refusal; `openOrder` repeats it under the lock.
  const early = await openConflict(getDb(), id, paying.map((l) => l.id));
  if (early) return NextResponse.json({ error: early }, { status: 409 });

  // What the offers cost before any promo; the charge itself is `amountMinor`.
  const listMinor = paying.reduce((s, l) => s + l.charge.totalMinor, 0);
  const discountMinor = paying.reduce((s, l) => s + l.charge.discountMinor, 0);
  let amountMinor = listMinor;
  let promo: { promoCode: string; discountMinor: number } | null = null;
  if (parsed.data.promoCode) {
    // The one-time hiring fee is never discounted (bug sheet 23 Oct).
    const feeMinor = paying.reduce((s, l) => s + l.charge.perHireMinor, 0);
    const quote = await quotePromo({ code: parsed.data.promoCode, subjectId: id, orderMinor: amountMinor, currency, audience: "employer", undiscountableMinor: feeMinor });
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
    if (quote.payableMinor <= 0) {
      return NextResponse.json({ error: "This code covers the whole order - contact us to complete it" }, { status: 400 });
    }
    promo = { promoCode: quote.promo.code, discountMinor: quote.discountMinor };
    amountMinor = quote.payableMinor;
  }
  if (amountMinor <= 0) return NextResponse.json({ error: "Nothing payable" }, { status: 400 });

  // Same notes the legacy app writes, so either app can settle the order.
  const notes = {
    employerId: id,
    purpose: "employer_checkout",
    proposalIds: paying.map((l) => l.id),
    // Legacy's word for paid in full is "total"; it reads anything else as
    // still owing and would offer to charge the months again (EMH-25).
    paymentMode: mode === "monthly" ? "monthly" : "total",
    dueProposalIds: paying.filter((l) => l.due).map((l) => l.id),
    // DB-07: legacy admin shows computedAmountMinor as the order amount, so
    // it is what is charged (0 for a free test order, net of any promo).
    computedAmountMinor: paymentsAreFree() && !parsed.data.testPay ? 0 : amountMinor,
    listAmountMinor: listMinor,
    discountAmountMinor: discountMinor + (promo?.discountMinor ?? 0),
  };
  // Test mode, or the test button: record the order and settle it straight
  // away, through the same settlement as a real payment (hire, notifications,
  // monthly dues). Free mode charges 0; the test button keeps the real amount.
  if (paymentsAreFree() || parsed.data.testPay) {
    const testPay = Boolean(parsed.data.testPay);
    const charged = testPay ? amountMinor : 0;
    const orderId = `${testPay ? "test" : "free_test"}_${randomUUID()}`;
    const refused = await openOrder(id, paying, promo?.promoCode, {
      employerId: id,
      gateway: testPay ? "test" : "free",
      orderId,
      amountMinor: charged,
      currency,
      status: "created",
      raw: { notes, order: legacyOrderRaw({ id: orderId, amountMinor: charged, currency, notes }), testMode: true, ...(promo ? { promo } : {}) },
    });
    if (refused) return NextResponse.json({ error: refused }, { status: 409 });
    // An order that never settles is closed, or it would block the next try for 30 minutes.
    // The status guard leaves one alone once it has been paid.
    const close = () =>
      getDb()
        .update(schema.employerPayments)
        .set({ status: "failed" })
        .where(and(eq(schema.employerPayments.orderId, orderId), eq(schema.employerPayments.employerId, id), eq(schema.employerPayments.status, "created")));
    const settled = await settleEmployerOrder({ orderId, paymentId: orderId, employerId: id }).catch(async (e) => {
      await close();
      throw e;
    });
    if (!settled.ok) {
      await close();
      return NextResponse.json({ error: settled.error }, { status: settled.status });
    }
    return NextResponse.json({ free: true });
  }

  try {
    // The gateway call comes first, outside the lock. A request that loses the
    // race leaves a Razorpay order nobody pays, which costs nothing.
    const order = await createOrder({ amountMinor, currency, receipt: `employer_${id.slice(0, 8)}_${Date.now().toString(36)}`, notes });
    const refused = await openOrder(id, paying, promo?.promoCode, {
      employerId: id,
      orderId: order.id,
      amountMinor,
      currency,
      status: "created",
      raw: { notes, order: legacyOrderRaw({ id: order.id, amountMinor, currency, notes }), ...(promo ? { promo } : {}) },
    });
    if (refused) return NextResponse.json({ error: refused }, { status: 409 });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency, keyId: razorpayKeyId() });
  } catch (e: unknown) {
    console.error("[employer/payment/razorpay/order]", e);
    return NextResponse.json({ error: "Payments are unavailable right now. Try again shortly." }, { status: 503 });
  }
}
