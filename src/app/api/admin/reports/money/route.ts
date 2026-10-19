import { NextResponse } from "next/server";

import { analyticsRange } from "@/lib/admin/analytics-load";
import { toCsv } from "@/lib/admin/csv";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import type { MoneyRow } from "@/lib/admin/receivables";
import { requireRole } from "@/lib/security/guards";

/** Money in / money out: JSON, or CSV with `?format=csv`. */
export async function GET(req: Request) {
  // A read (downloaded from a plain link), so no CSRF; the proxy checks reports:read.
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const data = await loadReceivables(analyticsRange(params), {
    receivables: moneyFilter(params.receivables),
    payables: moneyFilter(params.payables),
  });
  if (params.format !== "csv") return NextResponse.json(data);

  const rows = [
    ...data.receivables.map((r) => ({ ...r, kind: "Receivable" })),
    ...data.payables.map((r) => ({ ...r, kind: "Payable" })),
  ];
  const csv = toCsv<MoneyRow & { kind: string }>(rows, [
    { header: "Type", value: (r) => r.kind },
    { header: "Date", value: (r) => r.date },
    { header: "Source", value: (r) => r.source },
    { header: "Status", value: (r) => r.status },
    { header: "Description", value: (r) => r.description },
    { header: "Company", value: (r) => r.companyName ?? "" },
    { header: "Candidate", value: (r) => r.candidateName ?? "" },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Amount (INR)", value: (r) => (r.inrMinor / 100).toFixed(2) },
    { header: "Reference", value: (r) => r.reference ?? "" },
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="findtern-money-in-out-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
