import { NextResponse } from "next/server";

import { analyticsRange } from "@/lib/admin/analytics-load";
import { toCsv } from "@/lib/admin/csv";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { moneyRowFilter, narrowReceivables, type MoneyRow } from "@/lib/admin/receivables";
import { exportRange } from "@/lib/admin/reports/window";
import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";

/** Money in / money out: JSON, or CSV with `?format=csv`. */
export async function GET(req: Request) {
  // A read (downloaded from a plain link), so no CSRF; the proxy checks reports:read.
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  // The Finance tab's links carry `tab` / `range`: its Today / week / month window. Old links keep the legacy default.
  const range = exportRange(params, analyticsRange);
  const loaded = await loadReceivables(range, {
    receivables: moneyFilter(params.receivables),
    payables: moneyFilter(params.payables),
  });
  // The same company / candidate / status filters as the page (ADM-15).
  const data = narrowReceivables(loaded, moneyRowFilter(params));
  if (params.format !== "csv") return NextResponse.json(data);

  const rows = [
    ...data.receivables.map((r) => ({ ...r, kind: "Receivable" })),
    ...data.payables.map((r) => ({ ...r, kind: "Payable" })),
    // A refund is its own row beside the payment, never a negative receivable.
    ...data.refunds.map((r) => ({
      id: r.id, kind: "Refund to company", date: r.date, source: "company", status: r.creditNoteNeeded ? "credit note needed" : "refunded",
      description: r.description, companyName: r.companyName, candidateName: null, amountMinor: r.amountMinor, currency: r.currency, inrMinor: r.inrMinor, reference: r.reference,
    })),
  ] as (MoneyRow & { kind: string })[];
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
