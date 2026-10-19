import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Download, Hourglass, Wallet } from "lucide-react";

import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ReportRange } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { analyticsRange } from "@/lib/admin/analytics-load";
import { flattenParams } from "@/lib/admin/params";
import type { MoneyRow } from "@/lib/admin/receivables";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Money in and out" };

const STATUS_LABEL: Record<MoneyRow["status"], string> = {
  received: "Received",
  due: "Due",
  upcoming: "Upcoming",
  unpaid: "Fee not paid",
  paid: "Paid",
  pending: "Pending",
};

/** Legacy receivables / payables report (routes.ts:5100-5453), with INR totals. */
export default async function AdminMoneyReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const receivablesFilter = moneyFilter(params.receivables);
  const payablesFilter = moneyFilter(params.payables);
  const data = await loadReceivables(analyticsRange(params), { receivables: receivablesFilter, payables: payablesFilter });
  const query = new URLSearchParams(params).toString();
  const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" });

  const filterLinks = (key: "receivables" | "payables", current: string) => (
    <nav aria-label={`${key} source`} className="flex gap-1">
      {(["both", "company", "candidate"] as const).map((v) => {
        const q = new URLSearchParams({ ...params, [key]: v }).toString();
        return (
          <Link
            key={v}
            href={`/admin/reports/money?${q}`}
            aria-current={current === v ? "page" : undefined}
            className={`inline-flex min-h-8 items-center rounded-full px-2.5 text-2xs font-medium capitalize max-lg:min-h-11 ${
              current === v ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {v}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="apple-admin space-y-4">
      <AdminPageHeader
        title="Money in and out"
        subtitle="What companies and candidates owe Findtern, and what Findtern owes interns. Amounts keep their currency; totals are in INR (USD at ₹100/$)."
        action={
          <>
            <Link
              href="/admin/reports"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Reports
            </Link>
            <a
              href={`/api/admin/reports/money?${query}${query ? "&" : ""}format=csv`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          </>
        }
      />
      <ReportRange
        basePath="/admin/reports/money"
        params={params}
        defaultLabel="Last 18 months"
        hidden={{ receivables: params.receivables, payables: params.payables }}
      />

      <StatGrid cols={4}>
        <StatCard label="Received" value={inr(data.totals.receivedMinor)} hint="Paid orders and activation fees" icon={ArrowDownLeft} tone="success" />
        <StatCard label="Still to collect" value={inr(data.totals.dueMinor)} hint={`Accepted offers and monthly instalments · ${inr(data.totals.prospectMinor)} in unpaid fees`} icon={Hourglass} tone="warning" />
        <StatCard label="Paid to interns" value={inr(data.totals.paidOutMinor)} hint="Stipend payouts marked paid" icon={ArrowUpRight} tone="info" />
        <StatCard label="Owed to interns" value={inr(data.totals.owedMinor)} hint="Pending payouts and stipend months ahead" icon={Wallet} tone="accent" />
      </StatGrid>

      <MoneyTable title="Receivables" description="Money coming in." rows={data.receivables} filter={filterLinks("receivables", receivablesFilter)} />
      <MoneyTable title="Payables" description="Stipends going out to interns." rows={data.payables} filter={filterLinks("payables", payablesFilter)} />
    </div>
  );
}

function MoneyTable({ title, description, rows, filter }: { title: string; description: string; rows: MoneyRow[]; filter: React.ReactNode }) {
  const shown = rows.slice(0, 300);
  return (
    <Panel className="bg-white">
      <PanelHeader title={`${title} (${rows.length})`} description={description} action={filter} />
      <PanelBody className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-600">Nothing in this range.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-2xs uppercase tracking-[0.08em] text-ink-600">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Company</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Candidate</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Amount</th>
                <th scope="col" className="py-2 font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-700">{formatDate(r.date)}</td>
                  <td className="py-2 pr-3 text-ink-800">{r.description}</td>
                  <td className="py-2 pr-3 text-ink-700">{r.companyName ?? "-"}</td>
                  <td className="py-2 pr-3 text-ink-700">{r.candidateName ?? "-"}</td>
                  <td className="py-2 pr-3 text-ink-700">{STATUS_LABEL[r.status]}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-ink-900">
                    {formatMoney(r.amountMinor, r.currency as "INR" | "USD")}
                  </td>
                  <td className="py-2 font-mono text-2xs text-ink-600">{r.reference ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > shown.length ? (
          <p className="mt-3 text-xs text-ink-600">Showing the latest {shown.length}. The CSV export has all {rows.length}.</p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
