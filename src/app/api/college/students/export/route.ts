import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { masterRowsForCollege } from "@/lib/college/master-data";
import { COLUMN_KEYS, toCsv, type MasterColumn } from "@/lib/college/master-row";
import { auditCollegeView } from "@/lib/college/scope";
import { todayIst } from "@/lib/offer";

const bodySchema = z.object({
  columns: z.array(z.string()).min(1).max(60),
  userIds: z.array(z.string().min(1).max(64)).min(1).max(5000),
});

/**
 * Download the officer's current master data view as CSV. The file is built here from the rows this officer may
 * see (masterRowsForCollege: own college, unverified students redacted), so a tampered request can neither add
 * another college's student nor a column outside the list. Every download is written to the college audit log.
 */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "students:export");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one column and one student" }, { status: 400 });

  const columns = [...new Set(parsed.data.columns)].filter((c): c is MasterColumn["key"] => COLUMN_KEYS.has(c as MasterColumn["key"]));
  if (!columns.length) return NextResponse.json({ error: "Pick at least one column" }, { status: 400 });
  const wanted = new Set(parsed.data.userIds);
  // Keep the officer's on-screen order; ids that are not this college's students are dropped silently.
  const byId = new Map((await masterRowsForCollege(g.ctx)).map((r) => [r.userId, r]));
  const rows = parsed.data.userIds.filter((id, i, a) => a.indexOf(id) === i && wanted.has(id)).map((id) => byId.get(id)).filter((r) => r !== undefined);
  if (!rows.length) return NextResponse.json({ error: "No students in this view" }, { status: 400 });

  await auditCollegeView(
    { collegeId: g.ctx.college.id, actorType: "college_admin", actorId: g.ctx.admin.id },
    "export_master_data",
    null,
    { students: rows.length, columns },
  );
  const origin = new URL(req.url).origin;
  const day = todayIst(); // India date: between 00:00 and 05:30 IST the UTC date is still yesterday
  return new NextResponse(toCsv(rows, columns, origin), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="master-data-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
