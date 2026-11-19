import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { CGPA_FILTERS, firstAcceptedAt, matchesFilter, rowSla, searchRows, sortRows, type CgpaFilter, type CgpaQueueRow } from "@/lib/admin/cgpa-queue";
import { loadCgpaQueue } from "@/lib/admin/cgpa-queue-load";
import { csvFilename, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { allows } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * CSV of the CGPA queue with the page's own filter and search. Built on the server so the export is audited
 * (candidate phones and emails leave the console); fail closed: no audit row, no file.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(session.permissions, ["interns:read"])) return new NextResponse("Your role doesn't include this export. Ask a super admin for access.", { status: 403 });

  const url = new URL(req.url);
  const filter: CgpaFilter = CGPA_FILTERS.find((f) => f.key === url.searchParams.get("filter"))?.key ?? "pending";
  const q = (url.searchParams.get("q") ?? "").trim();
  const now = new Date();

  let all: CgpaQueueRow[];
  try {
    all = await loadCgpaQueue();
  } catch (err) {
    console.error("[admin/cgpa-verifications/export] load failed", err);
    return NextResponse.json({ error: "Could not load the CGPA checks" }, { status: 500 });
  }
  const rows = sortRows(searchRows(all, q).filter((r) => matchesFilter(r, filter, now)), filter);

  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.cgpa", targetType: "intern", targetId: null, meta: { rows: rows.length, filters: { filter, q } } }, { strict: true });
  } catch (err) {
    console.error("[admin/cgpa-verifications/export] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }

  const columns: CsvColumn<CgpaQueueRow>[] = [
    { header: "Candidate", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "College", value: (r) => r.college },
    { header: "Course", value: (r) => r.course },
    { header: "Semester", value: (r) => r.semester },
    { header: "Claimed score", value: (r) => r.claimedScore },
    { header: "Score type", value: (r) => r.scoreType },
    { header: "Corrected score", value: (r) => r.correctedScore },
    { header: "Status", value: (r) => r.status },
    { header: "Offer accepted at", value: (r) => firstAcceptedAt(r.proposals) },
    { header: "SLA", value: (r) => rowSla(r, now).label },
    { header: "Accepted offers", value: (r) => r.proposals.map((p) => `${p.company} - ${p.project} (starts ${p.startDate ?? "n/a"})`).join("; ") },
    { header: "Decided at", value: (r) => r.decidedAt },
  ];
  return csvResponse(toCsv(rows, columns), csvFilename("cgpa-verifications"));
}
