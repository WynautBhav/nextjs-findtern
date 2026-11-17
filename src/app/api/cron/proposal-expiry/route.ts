import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { expireUnpaidPastStart } from "@/lib/proposal-expiry-db";

export const dynamic = "force-dynamic";

/**
 * Daily backstop for the hourly in-process sweep (schedulers.ts): expires accepted offers that were not paid before their
 * start date. Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`; an unset secret closes the route. A deployment
 * on a copy of live data sets SCHEDULERS=off and neither sweeps nor notifies. Safe to run any number of times (idempotent).
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.SCHEDULERS === "off") return NextResponse.json({ skipped: true, reason: "SCHEDULERS is off" });
  return NextResponse.json(await expireUnpaidPastStart());
}
