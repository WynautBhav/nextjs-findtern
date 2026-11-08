import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runRefundReconcile } from "@/lib/refunds/refund-reconcile-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Settles refunds stuck in 'initiated' (a missed Razorpay webhook) by reading their status from Razorpay.
 * CRON_SECRET bearer like the other crons. OFF unless REFUND_RECONCILE=1 and the Razorpay keys are set: until then
 * it answers 200 {skipped:true} and touches neither the database nor Razorpay. SCHEDULERS=off also skips it, so a
 * copy of the live data never polls Razorpay. Read-only towards Razorpay; see src/lib/refunds/refund-reconcile.ts.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.SCHEDULERS === "off") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is off" });
  try {
    return NextResponse.json(await runRefundReconcile());
  } catch (e) {
    console.error("[cron:refund-reconcile]", e instanceof Error ? e.message.slice(0, 200) : "failed");
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
