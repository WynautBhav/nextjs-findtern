import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { sendPaymentReminders } from "@/lib/payment-reminders-job";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. Unset secret = closed.
 * Like the in-process scheduler it only sends when SCHEDULERS=on, so a deployment on a copy
 * of the live data (SCHEDULERS=off) never emails real employers.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.SCHEDULERS !== "on") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is not on" });
  return NextResponse.json(await sendPaymentReminders());
}
