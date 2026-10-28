import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { AdminLoadError, AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { ChipLinks, ReportRange } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonClass } from "@/components/ui/button";
import { analyticsRange } from "@/lib/admin/analytics-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { MONEY_STATUSES, moneyRowFilter, narrowReceivables, type MoneyRow, type Receivables } from "@/lib/admin/receivables";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Money in and out" };

const BASE = "/admin/reports/money";
const SHOWN = 300;

const STATUS_LABEL: Record<MoneyRow["status"], string> = {
  received: "Received",
  due: "Due",
  upcoming: "Upcoming",
  unpaid: "Fee not paid",
  paid: "Paid",
  pending: "Pending",
};

/** Status → the pill tone the rest of the console uses for the same state. */
const STATUS_TONE: Record<MoneyRow["status"], string> = {
  received: "paid",
  paid: "paid",
  due: "pending",
  pending: "pending",
  upcoming: "sent",
  unpaid: "inactive",
};

const field = "h-9 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600 max-lg:h-11";

/** Legacy receivables / payables report (routes.ts:5100-5453), with INR totals. */
export default async function AdminMoneyReportPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const receivablesFilter = moneyFilter(params.receivables);
  const payablesFilter = moneyFilter(params.payables);
  const rowFilter = moneyRowFilter(params);
  let data: Receivables | null = null;
  try {
    data = narrowReceivables(
      await loadReceivables(analyticsRange(params), { receivables: receivablesFilter, payables: payablesFilter }),
      rowFilter,
    );
  } catch (error) {
    console.error("[admin/reports/money] load failed", error);
  }
  const query = new URLSearchParams(params).toString();
  const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" });
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, ...patch });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${BASE}${q.size ? `?${q}` : ""}`;
  };
  const sourceLinks = (key: "receivables" | "payables", current: string) => (
    <ChipLinks
      label={`${key} source`}
      items={(["both", "company", "candidate"] as const).map((v) => ({
        href: link({ [key]: v === "both" ? "" : v }),
        label: v === "both" ? "All" : v === "company" ? "Companies" : "Candidates",
        current: current === v,
      }))}
    />
  );
  // Filters that ride along when the period changes.
  const keep = { receivables: params.receivables, payables: params.payables, company: params.company, candidate: params.candidate, status: params.status };
  const filtered = Boolean(rowFilter.company || rowFilter.candidate || rowFilter.status);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Money in and out"
        subtitle="Amounts keep their currency; totals are in INR (USD at ₹100/$)."
        action={
          <>
            <Link href="/admin/reports" className={buttonClass({ variant: "outline", size: "sm" })}>
              <ArrowLeft className="size-4" aria-hidden />
              Reports
            </Link>
            <a href={`/api/admin/reports/money?${query}${query ? "&" : ""}format=csv`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          </>
        }
      />
      <ReportRange basePath={BASE} params={params} defaultLabel="Last 18 months" hidden={keep} />

      {/* Candidate / company / status (ADM-15): one GET form, applies to both tables. */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-apple-lg border border-ink-200/80 bg-white px-4 py-3">
        {Object.entries(params)
          .filter(([k, v]) => v && !["company", "candidate", "status", "page"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Company
          <input name="company" defaultValue={rowFilter.company} placeholder="Any company" className={cn(field, "w-48")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Candidate
          <input name="candidate" defaultValue={rowFilter.candidate} placeholder="Any candidate" className={cn(field, "w-48")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Status
          <select name="status" defaultValue={rowFilter.status} className={field}>
            <option value="">Any status</option>
            {MONEY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={cn(buttonClass({ variant: "outline", size: "sm" }), "max-lg:h-11")}>
          Filter
        </button>
        {filtered ? (
          <Link href={link({ company: "", candidate: "", status: "" })} className={cn(buttonClass({ variant: "ghost", size: "sm" }), "max-lg:h-11")}>
            Clear
          </Link>
        ) : null}
      </form>

      {data ? (
        <>
          <StatGrid cols={4}>
            <StatCard label="Received" value={inr(data.totals.receivedMinor)} hint="Paid orders and activation fees" />
            <StatCard
              label="Still to collect"
              value={inr(data.totals.dueMinor)}
              hint={`Accepted offers and monthly instalments · ${inr(data.totals.prospectMinor)} in unpaid fees`}
            />
            <StatCard label="Paid to interns" value={inr(data.totals.paidOutMinor)} hint="Stipend payouts marked paid" />
            <StatCard label="Owed to interns" value={inr(data.totals.owedMinor)} hint="Pending payouts and stipend months ahead" />
          </StatGrid>

          <MoneyTable title="Receivables" description="Money coming in, newest first." rows={data.receivables} filter={sourceLinks("receivables", receivablesFilter)} filtered={filtered} />
          <MoneyTable title="Payables" description="Stipends going out to interns, newest first." rows={data.payables} filter={sourceLinks("payables", payablesFilter)} filtered={filtered} />
        </>
      ) : (
        <Panel>
          <AdminLoadError what="the money report" retryHref={BASE} />
        </Panel>
      )}
    </div>
  );
}

function MoneyTable({
  title,
  description,
  rows,
  filter,
  filtered,
}: {
  title: string;
  description: string;
  rows: MoneyRow[];
  filter: React.ReactNode;
  filtered: boolean;
}) {
  const shown = rows.slice(0, SHOWN);
  const head = ["Date", "Description", "Company", "Candidate", "Status", "Amount", "Reference"];
  return (
    <Panel>
      <PanelHeader title={`${title} (${rows.length.toLocaleString("en-IN")})`} description={description} action={filter} />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-600">
          {filtered ? "Nothing matches these filters in this range." : "Nothing in this range."}
        </p>
      ) : (
        // Focusable, so the inner scroll can be reached from the keyboard (axe scrollable-region-focusable).
        <div tabIndex={0} role="region" aria-label={title} className="max-h-[min(72vh,48rem)] overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                {head.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn("sticky top-0 z-10 bg-ink-50 px-3 py-2.5 text-xs font-semibold text-ink-600 first:pl-5 last:pr-5", h === "Amount" && "text-right")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="nums whitespace-nowrap px-3 py-2.5 pl-5 text-ink-700">{formatDate(r.date)}</td>
                  <td className="px-3 py-2.5 text-ink-800">{r.description}</td>
                  <td className="px-3 py-2.5 text-ink-700">{r.companyName ?? "-"}</td>
                  <td className="px-3 py-2.5 text-ink-700">{r.candidateName ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge value={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
                  </td>
                  <td className="nums whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink-900">
                    {formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: false })}
                  </td>
                  <td className="px-3 py-2.5 pr-5 font-mono text-xs text-ink-600">{r.reference ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <p className="border-t border-ink-100 px-5 py-3 text-sm text-ink-600">
          Showing 1–{shown.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
          {rows.length > shown.length ? ". The CSV export has every row." : ""}
        </p>
      ) : null}
    </Panel>
  );
}
