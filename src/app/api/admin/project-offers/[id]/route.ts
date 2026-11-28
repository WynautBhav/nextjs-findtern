import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/admin/audit";
import { loadProjectOffers } from "@/lib/admin/project-offers";
import { filterOffers, offersCsv, offersCsvFilename } from "@/lib/admin/project-offers-pure";
import { parsePipelineStatus } from "@/lib/admin/proposal-pipeline";
import { csvText } from "@/components/admin/dashboard/board/table-csv";
import { getDb } from "@/lib/db";
import { hasAnyPermission } from "@/lib/security/guards";

export const runtime = "nodejs";

/**
 * Read only: the offers sent on one project, for the Projects page's pop-up. They carry the interns' names, contacts and
 * pay, so interns:read (the proxy rule for /api/admin/project-offers, checked here too). `?format=csv&outcome=<bucket>`
 * is the pop-up's CSV: the same loader and filter as the rows on screen, audited, fail closed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyPermission(session, ["interns:read"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);

  let rows;
  try {
    rows = await loadProjectOffers(id);
  } catch (err) {
    console.error("[admin/project-offers]", err);
    return NextResponse.json({ error: "Could not load the offers" }, { status: 500 });
  }
  if (url.searchParams.get("format") !== "csv") return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });

  const outcome = parsePipelineStatus(url.searchParams.get("outcome")) || "all";
  const shown = filterOffers(rows, outcome);
  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.project_offers", targetType: "project", targetId: id, meta: { rows: shown.length, filters: { outcome } } }, { strict: true });
  } catch (err) {
    console.error("[admin/project-offers] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }
  return new Response(csvText(offersCsv(shown)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${offersCsvFilename(rows[0]?.drawer.project ?? "", outcome)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
