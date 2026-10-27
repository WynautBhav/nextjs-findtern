import { randomUUID } from "node:crypto";

import { and, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { payableCheckout } from "@/lib/employer-payable";
import { orderProposalIds, settleEmployerOrder } from "@/lib/payments";
import { quotePromo } from "@/lib/promo";
import { createOrder, paymentsAreFree, razorpayKeyId } from "@/lib/razorpay";

const bodySchema = z.object({
  currency: z.enum(["INR", "USD"]).default("INR"),
  /** One hire per payment (legacy checkout). */
  proposalIds: z.array(z.string().min(1)).length(1, "Pay for one hire at a time"),
  /** How a new hire is paid; a running monthly placement always pays its due month. */
  mode: z.enum(["upfront", "monthly"]).default("upfront"),
  promoCode: z.string().trim().min(1).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { currency } = parsed.data;

  // Amount is recomputed from the accepted offers; the client never sends it.
  const { lines } = await payableCheckout(id, { proposalIds: parsed.data.proposalIds, mode: parsed.data.mode });
  const paying = lines.filter((l) => l.currency === currency);
  if (paying.length === 0) return NextResponse.json({ error: "Nothing payable in this currency" }, { status: 400 });
  if (parsed.data.mode === "monthly" && paying.some((l) => !l.due && l.charge.monthlyBlocked)) {
    return NextResponse.json({ error: paying.find((l) => l.charge.monthlyBlocked)!.charge.monthlyBlocked }, { status: 400 });
  }
  // A due month is monthly whatever was asked; dues.ts counts these orders.
  const mode = paying.some((l) => l.due) ? "monthly" : parsed.data.mode;

  if (paying.some((l) => l.charge.totalMinor <= 0)) {
    return NextResponse.json({ error: "One of these offers has no amount to pay. Edit it before checking out." }, { status: 400 });
  }
  // An unpaid order from the last 30 minutes already covers one of these:
  // finish or close that one first, so the same hire can't be paid twice.
  const recent = await getDb()
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.employerId, id),
        eq(schema.employerPayments.status, "created"),
        gte(schema.employerPayments.createdAt, new Date(Date.now() - 30 * 60_000)),
      ),
    );
  const busy = new Set(recent.flatMap((r) => orderProposalIds(r.raw)));
  if (paying.some((l) => busy.has(l.id) && !l.due)) {
    return NextResponse.json({ error: "A payment for this is already open. Finish it or wait a few minutes." }, { status: 409 });
  }

  const computedMinor = paying.reduce((s, l) => s + l.charge.totalMinor, 0);
  const discountMinor = paying.reduce((s, l) => s + l.charge.discountMinor, 0);
  let amountMinor = computedMinor;
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
    computedAmountMinor: computedMinor,
    discountAmountMinor: discountMinor,
  };
  // Test mode: record the order as free and settle it straight away, through
  // the same settlement as a real payment (hire, notifications, monthly dues).
  if (paymentsAreFree()) {
    const orderId = `free_test_${randomUUID()}`;
    await getDb().insert(schema.employerPayments).values({
      employerId: id,
      gateway: "free",
      orderId,
      amountMinor: 0,
      currency,
      status: "created",
      raw: { notes, testMode: true, ...(promo ? { promo } : {}) },
    });
    const settled = await settleEmployerOrder({ orderId, paymentId: orderId, employerId: id });
    if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: settled.status });
    return NextResponse.json({ free: true });
  }

  try {
    const order = await createOrder({ amountMinor, currency, receipt: `employer_${id.slice(0, 8)}_${Date.now().toString(36)}`, notes });
    await getDb().insert(schema.employerPayments).values({
      employerId: id,
      orderId: order.id,
      amountMinor,
      currency,
      status: "created",
      raw: { notes, ...(promo ? { promo } : {}) },
    });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency, keyId: razorpayKeyId() });
  } catch (e: unknown) {
    console.error("[employer/payment/razorpay/order]", e);
    return NextResponse.json({ error: "Payments are unavailable right now. Try again shortly." }, { status: 503 });
  }
}
