import { NextResponse } from "next/server";

import { toCsv } from "@/lib/admin/csv";
import { parseCompanyFilter } from "@/lib/admin/reports/employers";
import { loadCompanies, type CompanyRow } from "@/lib/admin/reports/employers-load";
import { parseReportWindow } from "@/lib/admin/reports/window";
import { istDayKey } from "@/lib/admin/revenue";
import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";

const MAX_ROWS = 5000;

/** The company table as CSV, for the same period and filter the page shows. Up to 5,000 rows. */
export async function GET(req: Request) {
  // A read (downloaded from a plain link), so no CSRF; the proxy checks reports:read for /api/admin/reports.
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { rows } = await loadCompanies(parseCompanyFilter(params), parseReportWindow(params), { limit: MAX_ROWS, offset: 0, withTotal: false });
  const day = (d: Date | string | null) => (d ? (istDayKey(new Date(d)) ?? "") : "");
  const csv = toCsv<CompanyRow>(rows, [
    { header: "Company", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "City", value: (r) => r.city ?? "" },
    { header: "State", value: (r) => r.state ?? "" },
    { header: "Country", value: (r) => r.country ?? "" },
    { header: "Payment mode (latest paid order)", value: (r) => r.mode ?? "" },
    { header: "Projects", value: (r) => r.projects },
    { header: "Live projects", value: (r) => r.live },
    { header: "Paused projects", value: (r) => r.paused },
    { header: "Closed projects", value: (r) => r.closed },
    { header: "Proposals sent", value: (r) => r.sent },
    { header: "Accepted", value: (r) => r.accepted },
    { header: "Rejected", value: (r) => r.rejected },
    { header: "Pending", value: (r) => r.pending },
    { header: "Expired", value: (r) => r.expired },
    { header: "Withdrawn", value: (r) => r.withdrawn },
    { header: "Interviews", value: (r) => r.interviews },
    { header: "Hires", value: (r) => r.hires },
    { header: "Paid (INR, gross)", value: (r) => (r.paidMinor / 100).toFixed(2) },
    { header: "Joined (IST)", value: (r) => day(r.joined) },
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="findtern-companies-${istDayKey(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
