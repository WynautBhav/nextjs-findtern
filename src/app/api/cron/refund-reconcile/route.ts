import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { reconcileRefunds } from "@/lib/college/refund";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron (daily) and the VPS scheduler (every 15 min): refunds still `pending` / `initiated` after 15 minutes
 * are refreshed from Razorpay, so a missed webhook still settles. `Authorization: Bearer $CRON_SECRET`; unset = closed.
 * Reads Razorpay and updates our own rows only (no emails), so it runs whatever SCHEDULERS says.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await reconcileRefunds());
}
