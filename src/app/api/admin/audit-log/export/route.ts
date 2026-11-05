import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { loadAudit } from "@/lib/admin/audit-query";
import { csvFilename, csvResponse, toCsv } from "@/lib/admin/csv";
import { flattenParams } from "@/lib/admin/params";
import { allows } from "@/lib/admin/permissions";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

const MAX_ROWS = 10_000;

/** CSV of the audit log with the filters on screen; the export is itself audited (fail closed). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(session.permissions, ["roles:write"])) return new NextResponse("Your role doesn't include this export.", { status: 403 });

  const params = flattenParams(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const { rows, total } = await loadAudit(params, (params.q ?? "").trim(), { limit: MAX_ROWS, offset: 0 });
  if (total > MAX_ROWS) return new NextResponse("More than 10,000 entries match; narrow the filters.", { status: 400 });

  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.audit_log", targetType: "audit_log", meta: { rows: rows.length, filters: params } }, { strict: true });
  } catch (err) {
    console.error("[admin/audit-log/export] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }

  return csvResponse(
    toCsv(rows, [
      { header: "When (IST)", value: (r) => r.when?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) ?? "" },
      { header: "Staff", value: (r) => r.staffName ?? "" },
      { header: "Staff email", value: (r) => r.staffEmail ?? "" },
      { header: "Action", value: (r) => r.actionLabel },
      { header: "Target type", value: (r) => r.targetType ?? "" },
      { header: "Target", value: (r) => r.targetName ?? r.targetId ?? "" },
      { header: "Details", value: (r) => r.details },
    ]),
    csvFilename("audit-log"),
  );
}
