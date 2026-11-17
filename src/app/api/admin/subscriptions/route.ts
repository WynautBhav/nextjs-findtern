import { NextResponse } from "next/server";

import { csvFilename, csvResponse } from "@/lib/admin/csv";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { filterSubscriptionRows, parseStatusFilter, subscriptionsCsv } from "@/lib/subscription/admin-list";
import { loadSubscriptionRows } from "@/lib/subscription/admin-list-load";

/**
 * The Subscriptions list as a file: `?format=csv` honours the same `status` and `q` the page shows, so the file holds exactly
 * the rows on screen. A read, so it uses the session (no CSRF token) and works as a plain download link. Needs transactions:read.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  if (!allows(session.permissions, requiredPermissions(url.pathname, "GET"))) return NextResponse.json({ error: "You don't have permission to see this" }, { status: 403 });

  let loaded;
  try {
    loaded = await loadSubscriptionRows();
  } catch (e) {
    console.error("[admin/subscriptions] load failed", e);
    return NextResponse.json({ error: "Couldn't load subscriptions. Try again." }, { status: 503 });
  }
  const rows = filterSubscriptionRows(loaded.rows, { status: parseStatusFilter(url.searchParams.get("status")), q: url.searchParams.get("q") });
  if (url.searchParams.get("format") === "csv") return csvResponse(subscriptionsCsv(rows), csvFilename("findtern-pro-subscriptions"));
  return NextResponse.json({ rows });
}
