import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { sendPaymentReminders } from "@/lib/payment-reminders-job";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. Unset secret = closed.
 * Setting CRON_SECRET is the opt-in for this route, so it sends unless SCHEDULERS is explicitly
 * "off" (unlike the in-process scheduler, which needs SCHEDULERS=on). A deployment on a copy
 * of the live data sets SCHEDULERS=off and never emails real employers.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.SCHEDULERS === "off") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is off" });
  return NextResponse.json(await sendPaymentReminders());
}
