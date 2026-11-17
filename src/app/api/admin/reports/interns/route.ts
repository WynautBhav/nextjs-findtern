import { NextResponse } from "next/server";

import { toCsv } from "@/lib/admin/csv";
import { bandLabel, bandOf, internStage, parseInternFilter, skillNames, STAGE_LABEL } from "@/lib/admin/reports/interns";
import { loadInternTable, type InternRow } from "@/lib/admin/reports/interns-load";
import { istDayKey } from "@/lib/admin/revenue";
import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";

const MAX_ROWS = 5000;

/** The intern table as CSV, for the same filter the page shows (`?iq=&icity=&iskill=&istatus=&iband=&isort=&idir=`). Up to 5,000 rows. */
export async function GET(req: Request) {
  // A read (downloaded from a plain link), so no CSRF; the proxy checks reports:read for /api/admin/reports.
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const filter = parseInternFilter(Object.fromEntries(new URL(req.url).searchParams));
  const { rows } = await loadInternTable(filter, { limit: MAX_ROWS, offset: 0, withTotal: false });
  const day = (d: Date | string | null) => (d ? (istDayKey(new Date(d)) ?? "") : "");
  const csv = toCsv<InternRow>(rows, [
    { header: "Name", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "City", value: (r) => r.city ?? "" },
    { header: "State", value: (r) => r.state ?? "" },
    { header: "College", value: (r) => r.college ?? "" },
    { header: "Degree", value: (r) => r.degree ?? "" },
    { header: "Skills", value: (r) => skillNames(r.skills).join("; ") },
    { header: "Findtern score", value: (r) => (r.score == null ? "" : r.score.toFixed(1)) },
    { header: "Band", value: (r) => bandLabel(bandOf(r.score)) },
    { header: "Account", value: (r) => r.status },
    { header: "Stage", value: (r) => STAGE_LABEL[internStage({ profileStarted: r.started, profileComplete: r.complete, feePaid: r.paid, scored: r.score != null, applied: r.applied, hired: r.hired })] },
    { header: "Joined (IST)", value: (r) => day(r.createdAt) },
    { header: "Last active (IST)", value: (r) => day(r.lastSeen) },
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="findtern-interns-${istDayKey(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
