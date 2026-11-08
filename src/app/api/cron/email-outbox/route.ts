import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runOutboxDrain } from "@/lib/outbox/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Same CRON_SECRET bearer check as /api/cron/payment-reminders. Sends queued campaign mail: batches of 50
 * until the queue has nothing due or the time budget is used (a daily Vercel cron still clears a backlog).
 * MAIL_MODE=log sends nothing real (the mailer writes to the log instead).
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.SCHEDULERS === "off") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is off" });
  try {
    return NextResponse.json(await runOutboxDrain());
  } catch (e) {
    console.error("[cron:email-outbox]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Tick failed" }, { status: 500 });
  }
}
