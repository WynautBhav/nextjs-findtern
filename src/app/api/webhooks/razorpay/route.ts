import { NextResponse } from "next/server";

import { settleEmployerOrder, settleInternOrder } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { settleRefundWebhook } from "@/lib/refunds/refunds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (payment.captured / order.paid): settles orders whose
 * browser callback never arrived. refund.processed / refund.failed settle student refunds, and
 * record an employer order's refund beside the order. Unsigned or mis-signed events are refused.
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
  if (event.event === "refund.processed" || event.event === "refund.failed") {
    try {
      const outcome = await settleRefundWebhook(event as Parameters<typeof settleRefundWebhook>[0]);
      if (outcome === "unknown") console.warn("[razorpay webhook] refund event for unknown refund id");
      // 200 either way (a retry cannot fix it), but a refund bigger than the payment needs a human.
      if (outcome === "employer_over_paid") console.error("[razorpay webhook] employer refund exceeds the amount paid; not recorded");
      return NextResponse.json({ status: outcome === "unknown" ? "unknown_refund" : "ok" });
    } catch (error) {
      console.error("[razorpay webhook] refund", error);
      return NextResponse.json({ error: "Webhook error" }, { status: 500 });
    }
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
