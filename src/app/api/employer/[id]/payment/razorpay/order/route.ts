import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { payableCheckout } from "@/lib/employer-payable";
import { getRazorpay } from "@/lib/razorpay";

const bodySchema = z.object({ currency: z.string().default("INR") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // The amount is recomputed here from accepted proposals - the client asks
  // for "the <currency> total" and nothing more. If a posted amountMinor were
  // trusted, an employer could pay less by editing the request.
  const { totals } = await payableCheckout(id);
  const currency = parsed.data.currency.toUpperCase();
  const totalMajor = totals.get(currency as never) ?? 0;
  if (totalMajor <= 0) {
    return NextResponse.json({ error: "Nothing payable in this currency" }, { status: 400 });
  }
  const amountMinor = Math.round(totalMajor * 100);

  try {
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountMinor,
      currency,
      receipt: `employer_${id}`,
    });
    const db = getDb();
    await db.insert(schema.employerPayments).values({
      employerId: id,
      orderId: order.id,
      amountMinor,
      currency,
      status: "created",
    });
    return NextResponse.json({ orderId: order.id, amount: amountMinor, currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Razorpay not configured" }, { status: 503 });
  }
}
