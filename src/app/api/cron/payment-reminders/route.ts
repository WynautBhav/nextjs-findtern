import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { sendPaymentReminders } from "@/lib/payment-reminders-job";

export const dynamic = "force-dynamic";

/** Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. Unset secret = closed. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendPaymentReminders());
}
