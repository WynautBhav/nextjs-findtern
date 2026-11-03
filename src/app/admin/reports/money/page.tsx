import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ChipLinks } from "@/components/admin/report-range";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { PeriodBar } from "@/components/admin/reports/period-bar";
import { StatStrip, trendOf } from "@/components/admin/reports/stat-strip";
import { formatPercentDelta, monthlyFlows, percentChange, previousWindow } from "@/lib/admin/reports-shape";
import { loadCollected } from "@/lib/admin/receivables-load";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { analyticsRange } from "@/lib/admin/analytics-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { MONEY_STATUSES, moneyRowFilter, narrowReceivables, type MoneyRow, type Receivables } from "@/lib/admin/receivables";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { netMinor } from "@/lib/admin/revenue";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";

export const metadata: Metadata = { title: "Money in and out" };

const BASE = "/admin/reports/money";
const SHOWN = 300;
/** Rows drawn before "Show all": long enough to be useful, short enough not to bury the page. */
const FIRST_ROWS = 25;

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

const field =
  "h-10 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

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
  const range = analyticsRange(params);
  const prev = data ? previousWindow(range) : null;
  // Same definition as the Reports page (loadCollected), so the delta is not a different "received".
  // Like with like: the source chips pick the matching side, and a company/candidate/status filter has no comparable base.
  const rowFiltered = Boolean(rowFilter.company || rowFilter.candidate || rowFilter.status);
  const sideOf = (c: { receivedMinor: number; employerMinor: number; internMinor: number }) =>
    receivablesFilter === "company" ? c.employerMinor : receivablesFilter === "candidate" ? c.internMinor : c.receivedMinor;
  const prevReceived =
    prev && !rowFiltered && (params.period !== "all" || params.from || params.to)
      ? await loadCollected(prev).then(sideOf).catch(() => null)
      : null;
  const receivedChange = data && prevReceived !== null ? percentChange(data.totals.receivedMinor, prevReceived) : null;
  const view = params.view === "payables" ? "payables" : "receivables";
  const query = new URLSearchParams(params).toString();
  // A real minus sign (U+2212) glued to the figure, never a hyphen that can wrap off it.
  const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" }).replace(/^[-–−]\s*/, "\u2212");
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
  const keep = { receivables: params.receivables, payables: params.payables, company: params.company, candidate: params.candidate, status: params.status, view: params.view };
  const filtered = Boolean(rowFilter.company || rowFilter.candidate || rowFilter.status);
  const flows = data ? monthlyFlows(data.receivables, data.payables) : [];

  return (
    <div className="space-y-6 lg:space-y-8">
      <AdminPageHeader
        title="Money in and out"
        subtitle="Amounts keep their currency; totals are in INR (USD at ₹100/$)."
        action={
          <>
            <ButtonLink href="/admin/reports" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
              Reports
            </ButtonLink>
            <ButtonAnchor
              href={`/api/admin/reports/money?${query}${query ? "&" : ""}format=csv`}
              variant="primary"
              size="sm"
              className={ADMIN_PILL_PRIMARY}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </ButtonAnchor>
          </>
        }
      />
      <PeriodBar basePath={BASE} params={params} defaultValue="" defaultLabel="Last 18 months" hidden={keep} />

      {/* Candidate / company / status (ADM-15): one GET form, applies to both
          tables as you change it (no Filter button, QA-149). */}
      <AutoSubmitForm className="flex flex-wrap items-end gap-3">
        {Object.entries(params)
          .filter(([k, v]) => v && !["company", "candidate", "status", "page"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-text-subtle">
          Company
          <input name="company" defaultValue={rowFilter.company} placeholder="Any company" className={cn(field, "w-48")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-subtle">
          Candidate
          <input name="candidate" defaultValue={rowFilter.candidate} placeholder="Any candidate" className={cn(field, "w-48")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-subtle">
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
        <button type="submit" className="sr-only">
          Apply filters
        </button>
        {filtered ? (
          <Link
            href={link({ company: "", candidate: "", status: "" })}
            className="apple-spring inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            Clear
          </Link>
        ) : null}
      </AutoSubmitForm>

      {data ? (
        <>
          <StatStrip
            stats={[
              {
                label: "Received",
                value: inr(data.totals.receivedMinor),
                delta: formatPercentDelta(receivedChange) || undefined,
                trend: trendOf(receivedChange),
                note: receivedChange === null ? "Paid orders and activation fees" : "vs the period before",
              },
              {
                label: "Still to collect",
                value: inr(data.totals.dueMinor),
                note: `Accepted offers and instalments \u00b7 ${inr(data.totals.prospectMinor)} in unpaid fees`,
              },
              { label: "Paid to interns", value: inr(data.totals.paidOutMinor), note: "Stipend payouts marked paid" },
              { label: "Owed to interns", value: inr(data.totals.owedMinor), note: "Pending payouts and stipend months ahead" },
              { label: "Net", value: inr(netMinor(data.totals)), accent: netMinor(data.totals) >= 0, negative: netMinor(data.totals) < 0, note: "Received, less paid and owed to interns" },
            ]}
          />

          <ChartCard
            views={[
              {
                key: "flow",
                tab: "Cash flow",
                title: "Is more money coming in than going out?",
                note: "Cash that actually moved per month in this period: payments received and stipends paid to interns. Due and upcoming amounts are not included.",
                unit: "Rupees per month",
                format: "inr",
                series: [
                  { label: "Received", tone: "current", points: flows.map((f) => ({ x: f.label, y: f.inMinor })) },
                  { label: "Paid to interns", tone: "previous", points: flows.map((f) => ({ x: f.label, y: f.outMinor })) },
                ],
              },
            ]}
          />

          <MoneyTable
            title={view === "receivables" ? "Receivables" : "Payables"}
            description={view === "receivables" ? "Money coming in, newest first." : "Stipends going out to interns, newest first."}
            rows={view === "receivables" ? data.receivables : data.payables}
            filter={view === "receivables" ? sourceLinks("receivables", receivablesFilter) : sourceLinks("payables", payablesFilter)}
            filtered={filtered}
            expanded={params.rows === "all"}
            tabs={
              <ChipLinks
                label="Table"
                items={[
                  { href: link({ view: "", rows: "" }), label: `Receivables (${formatNumber(data.receivables.length)})`, current: view === "receivables" },
                  { href: link({ view: "payables", rows: "" }), label: `Payables (${formatNumber(data.payables.length)})`, current: view === "payables" },
                ]}
              />
            }
            moreHref={link({ rows: "all" })}
          />
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
  expanded,
  tabs,
  moreHref,
}: {
  title: string;
  description: string;
  rows: MoneyRow[];
  filter: React.ReactNode;
  filtered: boolean;
  expanded: boolean;
  tabs: React.ReactNode;
  moreHref: string;
}) {
  const shown = rows.slice(0, expanded ? SHOWN : FIRST_ROWS);
  const head = ["Date", "Description", "Company", "Candidate", "Status", "Amount", "Reference"];
  return (
    <Panel>
      <PanelHeader title={title} description={description} action={filter} />
      <div className="px-[var(--admin-pad-panel)] pt-3">{tabs}</div>
      {rows.length === 0 ? (
        <p className="px-[var(--admin-pad-panel)] py-10 text-center text-sm text-text-subtle">
          {filtered ? "Nothing matches these filters in this range." : "Nothing in this range."}
        </p>
      ) : (
        // Focusable, so the inner scroll can be reached from the keyboard (axe scrollable-region-focusable).
        <div tabIndex={0} role="region" aria-label={title} data-stack className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <table className="w-full text-left text-sm lg:min-w-[48rem]">
            <thead>
              <tr className="border-b border-[color:var(--admin-rule)]">
                {head.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn("sticky top-0 z-10 bg-[color:var(--admin-panel)] px-3 py-2.5 text-[0.8125rem] font-medium text-text-subtle first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", h === "Amount" && "text-right")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-[color:var(--admin-rule)] last:border-0 hover:bg-[color:var(--admin-panel-2)]">
                  <td data-label="Date" className="nums px-3 py-2.5 text-foreground first:pl-[var(--admin-pad-panel)] lg:whitespace-nowrap">{formatDate(r.date)}</td>
                  <td data-title className="px-3 py-2.5 text-foreground [overflow-wrap:anywhere]">{r.description}</td>
                  <td data-label="Company" data-empty={r.companyName ? undefined : ""} className="px-3 py-2.5 text-foreground [overflow-wrap:anywhere]">
                    {r.companyName ? <IdentityCell name={r.companyName} size="sm" /> : <span className="text-text-subtle">-</span>}
                  </td>
                  <td data-label="Candidate" data-empty={r.candidateName ? undefined : ""} className="px-3 py-2.5 text-foreground [overflow-wrap:anywhere]">
                    {r.candidateName ? <IdentityCell name={r.candidateName} size="sm" /> : <span className="text-text-subtle">-</span>}
                  </td>
                  <td data-label="Status" className="px-3 py-2.5">
                    <StatusBadge value={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
                  </td>
                  <td data-label="Amount" className="nums px-3 py-2.5 text-right font-semibold text-foreground lg:whitespace-nowrap">
                    {formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: false })}
                  </td>
                  <td data-label="Reference" className="nums px-3 py-2.5 text-[0.8125rem] text-text-subtle [overflow-wrap:anywhere] last:pr-[var(--admin-pad-panel)]">{r.reference ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-3 text-sm text-text-subtle">
          <span>
            Showing 1{"\u2013"}{formatNumber(shown.length)} of {formatNumber(rows.length)}
            {rows.length > SHOWN ? ". The CSV export has every row." : ""}
          </span>
          {rows.length > shown.length ? (
            <Link href={moreHref} scroll={false} className="font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Show {formatNumber(Math.min(rows.length, SHOWN))} rows
            </Link>
          ) : null}
        </p>
      ) : null}
    </Panel>
  );
}
