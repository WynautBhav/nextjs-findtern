import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runOutboxTick } from "@/lib/outbox/run";

export const dynamic = "force-dynamic";

/** Same CRON_SECRET bearer check as /api/cron/payment-reminders. Sends one batch of queued drive-code mail. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.SCHEDULERS === "off") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is off" });
  try {
    return NextResponse.json(await runOutboxTick());
  } catch (e) {
    console.error("[cron:email-outbox]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Tick failed" }, { status: 500 });
  }
}
