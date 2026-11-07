import { NextResponse } from "next/server";

import { clampPage } from "@/lib/college/drive-dashboard";
import { requireCollegeRead } from "@/lib/college/guard";
import { collegeDriveMetrics, collegeDriveStudents } from "@/lib/drives/dashboard-db";

export const dynamic = "force-dynamic";

/** Read-only, TPO session only. The college id comes from the session, never the query. */
export async function GET(req: Request) {
  const guard = await requireCollegeRead();
  if (!guard.ok) return guard.response;
  const collegeId = guard.ctx.college.id;
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, offset } = clampPage(sp.get("page"), sp.get("pageSize"));
  const [metrics, students] = await Promise.all([
    collegeDriveMetrics(collegeId),
    collegeDriveStudents({ collegeId, search: sp.get("q") ?? "", status: sp.get("status") ?? "", offset, limit: pageSize }),
  ]);
  return NextResponse.json(
    { metrics, students: { rows: students.rows, total: students.total, page, pageSize } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
