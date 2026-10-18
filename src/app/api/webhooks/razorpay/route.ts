import { NextResponse } from "next/server";

import { settleEmployerOrder, settleInternOrder } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (payment.captured / order.paid): settles orders whose
 * browser callback never arrived. Unsigned or mis-signed events are refused.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string; status?: string } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return NextResponse.json({ status: "ignored" });

  const entity = event.payload?.payment?.entity;
  const orderId = entity?.order_id;
  const paymentId = entity?.id;
  if (!orderId || !paymentId) return NextResponse.json({ status: "ignored" });

  try {
    const intern = await settleInternOrder({ orderId, paymentId });
    if (!intern.ok) await settleEmployerOrder({ orderId, paymentId });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[razorpay webhook]", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
