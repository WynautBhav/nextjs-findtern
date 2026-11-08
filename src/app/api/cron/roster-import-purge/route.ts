import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { purgeRosterImports } from "@/lib/college/roster-import-purge";

export const dynamic = "force-dynamic";

/**
 * Deletes expired college roster imports (the uploaded names, emails and phones with them), one
 * batch per call, idempotent. Same CRON_SECRET bearer check as the other crons (an unset secret is
 * closed). SCHEDULERS=off does not skip it: the job sends nothing, and expired personal data should
 * go on a copy of live data too.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await purgeRosterImports());
  } catch (e) {
    console.error("[cron:roster-import-purge]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
