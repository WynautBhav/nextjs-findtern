import { NextResponse } from "next/server";

import { allows, requiredPermissions } from "@/lib/admin/permissions";

import { getSession } from "@/lib/auth";
import { clampPage } from "@/lib/college/drive-dashboard";
import { adminDriveOverview } from "@/lib/drives/dashboard-db";

export const dynamic = "force-dynamic";

/** Read-only global drive overview. Admin session with the path's permission (companies:read). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  if (session.role !== "admin" || !allows(session.permissions, requiredPermissions(url.pathname, "GET"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = url.searchParams;
  const { page, pageSize, offset } = clampPage(sp.get("page"), sp.get("pageSize"));
  const data = await adminDriveOverview({ q: sp.get("q") ?? "", status: sp.get("status") ?? "", offset, limit: pageSize });
  return NextResponse.json({ ...data, page, pageSize }, { headers: { "Cache-Control": "private, no-store" } });
}
