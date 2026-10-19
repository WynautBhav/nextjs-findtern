import { NextResponse } from "next/server";

import { analyticsRange, loadAnalytics } from "@/lib/admin/analytics-load";
import { requireRole } from "@/lib/security/guards";

/** Hiring analytics as JSON (legacy offered a JSON export of the same numbers). */
export async function GET(req: Request) {
  // A read (downloaded from a plain link), so no CSRF; the proxy checks reports:read.
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const range = analyticsRange(params);
  const data = await loadAnalytics(range);
  const body = { range: { from: range.since?.toISOString() ?? null, to: range.until?.toISOString() ?? null }, ...data };
  return NextResponse.json(body, {
    headers:
      params.download === "1"
        ? { "content-disposition": `attachment; filename="findtern-analytics-${new Date().toISOString().slice(0, 10)}.json"` }
        : {},
  });
}
