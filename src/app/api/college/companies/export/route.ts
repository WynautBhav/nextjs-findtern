import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { companiesCsv } from "@/lib/college/companies";
import { companiesForCollege } from "@/lib/college/companies-db";
import { auditCollegeView } from "@/lib/college/scope";
import { todayIst } from "@/lib/offer";

const bodySchema = z.object({ keys: z.array(z.string().min(1).max(320)).min(1).max(5000) });

/**
 * Download the companies the officer is looking at as CSV. The rows are built here from this officer's own college drives
 * (companiesForCollege), and `keys` only picks and orders among them, so a tampered request cannot add another college's company.
 * Same permission as the student download; every download is written to the college audit log.
 */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "students:export");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one company" }, { status: 400 });

  const byKey = new Map((await companiesForCollege(g.ctx)).map((r) => [r.key, r]));
  const rows = [...new Set(parsed.data.keys)].map((k) => byKey.get(k)).filter((r) => r !== undefined);
  if (!rows.length) return NextResponse.json({ error: "No companies in this list" }, { status: 400 });

  await auditCollegeView({ collegeId: g.ctx.college.id, actorType: "college_admin", actorId: g.ctx.admin.id }, "export_companies", null, { companies: rows.length });
  return new NextResponse(companiesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies-${todayIst()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
