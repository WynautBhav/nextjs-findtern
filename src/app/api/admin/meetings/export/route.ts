import { NextResponse } from "next/server";

import { csvText, tableCsv } from "@/components/admin/dashboard/board/table-csv";
import { parseSort } from "@/components/admin/data-table";
import { recordAdminAudit } from "@/lib/admin/audit";
import { csvFilename, csvResponse } from "@/lib/admin/csv";
import { listMeetings, meetingCsvRow, MEETING_COLUMNS, MEETING_DEFAULT_SORT, MEETING_SORTS } from "@/lib/admin/meeting-stage";
import { loadMeetings } from "@/lib/admin/meetings-load";
import { flattenParams } from "@/lib/admin/params";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * The Meeting pipeline's CSV, built only when an admin presses Export: the page's own loader and list function
 * (listMeetings) over the same query string, so the file is exactly the table's columns for every row the table pages
 * through. A read (no CSRF; a plain download link works). Same permission as the page; audited, failing closed.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(session.permissions, requiredPermissions("/admin/meetings"))) {
    return new NextResponse("Your role doesn't include the meeting pipeline.", { status: 403 });
  }

  const params = flattenParams(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const sort = parseSort(params, MEETING_SORTS, MEETING_DEFAULT_SORT);
  const { listed } = listMeetings((await loadMeetings()).rows, params, sort);

  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.meetings", targetType: "interview", targetId: null, meta: { rows: listed.length, filters: params } }, { strict: true });
  } catch (err) {
    console.error("[admin/meetings/export] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }
  const columns = [...MEETING_COLUMNS];
  return csvResponse(csvText(tableCsv(columns, new Set(columns), listed.map((r) => ({ csv: meetingCsvRow(r) })))), csvFilename("meetings"));
}
