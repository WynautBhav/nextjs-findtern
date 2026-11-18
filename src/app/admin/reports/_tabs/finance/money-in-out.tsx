import Link from "next/link";
import { Download } from "lucide-react";

import { IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, Panel, PanelHeader } from "@/components/admin/panel";
import { ChipLinks } from "@/components/admin/report-range";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { StatStrip, trendOf } from "@/components/admin/reports/stat-strip";
import { formatPercentDelta, monthlyFlows, percentChange } from "@/lib/admin/reports-shape";
import { loadCollected } from "@/lib/admin/receivables-load";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { MONEY_STATUSES, moneyRowFilter, narrowReceivables, type MoneyRow, type Receivables } from "@/lib/admin/receivables";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { istDayKey, netMinor } from "@/lib/admin/revenue";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FILTER_BUTTON, FILTER_CONTROL, FILTER_SELECT, FilterBar, FilterField } from "@/components/admin/filter-controls";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";

import type { TabProps } from "../types";

const BASE = "/admin/reports";
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

/**
 * The old Money in and out report (legacy receivables / payables, routes.ts:5100-5453), now a section of the Finance
 * tab: same loaders, tiles, filters, tables and CSV, with the period taken from the tab's window.
 */
export default async function MoneyInOut({ window: w, params }: TabProps) {
  const receivablesFilter = moneyFilter(params.receivables);
  const payablesFilter = moneyFilter(params.payables);
  const rowFilter = moneyRowFilter(params);
  let data: Receivables | null = null;
  try {
    data = narrowReceivables(
      await loadReceivables({ since: w.since, until: w.until }, { receivables: receivablesFilter, payables: payablesFilter }),
      rowFilter,
    );
  } catch (error) {
    console.error("[admin/reports/money] load failed", error);
  }
  const prev = data && w.prevSince ? { since: w.prevSince, until: w.prevUntil } : null;
  // Same definition as the Reports page (loadCollected), so the delta is not a different "received".
  // Like with like: the source chips pick the matching side, and a company/candidate/status filter has no comparable base.
  const rowFiltered = Boolean(rowFilter.company || rowFilter.candidate || rowFilter.status);
  // College seat sales sit on the company side (a college is a customer, like an employer).
  const sideOf = (c: { receivedMinor: number; employerMinor: number; internMinor: number; collegeMinor: number }) =>
    receivablesFilter === "company" ? c.employerMinor + c.collegeMinor : receivablesFilter === "candidate" ? c.internMinor : c.receivedMinor;
  const prevReceived =
    prev && !rowFiltered
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
  const filtered = Boolean(rowFilter.company || rowFilter.candidate || rowFilter.status);
  // "Due" rows are owed now (accepted offers, post-paid months); overdue is the part whose date has already passed (India date).
  const today = istDayKey(new Date());
  const overdueMinor = data ? data.receivables.filter((r) => r.status === "due" && r.date < today!).reduce((s, r) => s + r.inrMinor, 0) : 0;
  const pendingPayableMinor = data ? data.payables.filter((r) => r.status === "pending").reduce((s, r) => s + r.inrMinor, 0) : 0;
  const flows = data ? monthlyFlows(data.receivables, data.payables) : [];

  return (
    <section aria-labelledby="money-in-out" className="space-y-5 lg:space-y-6" data-rp="money-in-out">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="money-in-out" className="text-lg font-semibold tracking-[-0.01em] text-foreground">
          Money in and out
          <span className="ml-2 text-sm font-normal text-text-subtle">Amounts keep their currency; totals are in INR (USD at ₹100/$).</span>
        </h2>
        <ButtonAnchor href={`/api/admin/reports/money?${query}${query ? "&" : ""}format=csv`} variant="primary" size="sm" className={ADMIN_PILL_PRIMARY}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </ButtonAnchor>
      </div>

      {/* Candidate / company / status (ADM-15): one GET form, applies to both
          tables as you change it (no Filter button, QA-149). */}
      <AutoSubmitForm>
        {Object.entries(params)
          .filter(([k, v]) => v && !["company", "candidate", "status", "page"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <FilterBar name="money-in-out">
          <FilterField label="Company" htmlFor="money-company">
            <input id="money-company" name="company" defaultValue={rowFilter.company} placeholder="Any company" className={cn(FILTER_CONTROL, "w-48 max-sm:w-full")} />
          </FilterField>
          <FilterField label="Candidate" htmlFor="money-candidate">
            <input id="money-candidate" name="candidate" defaultValue={rowFilter.candidate} placeholder="Any candidate" className={cn(FILTER_CONTROL, "w-48 max-sm:w-full")} />
          </FilterField>
          <FilterField label="Status" htmlFor="money-status">
            <select id="money-status" name="status" defaultValue={rowFilter.status} className={FILTER_SELECT}>
              <option value="">Any status</option>
              {MONEY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </FilterField>
          <button type="submit" className="sr-only">
            Apply filters
          </button>
          {filtered ? (
            <FilterField>
              <Link href={link({ company: "", candidate: "", status: "" })} className={FILTER_BUTTON}>
                Clear
              </Link>
            </FilterField>
          ) : null}
        </FilterBar>
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
                note: `Accepted offers and instalments \u00b7 ${inr(overdueMinor)} past its date \u00b7 ${inr(data.totals.prospectMinor)} in unpaid fees`,
              },
              { label: "Paid to interns", value: inr(data.totals.paidOutMinor), note: "Stipend payouts marked paid" },
              { label: "Owed to interns", value: inr(data.totals.owedMinor), note: `${inr(pendingPayableMinor)} pending payouts \u00b7 ${inr(data.totals.owedMinor - pendingPayableMinor)} stipend months ahead` },
              ...(data.refunds.length > 0
                ? [{ label: "Refunded to companies", value: inr(data.refundTotals.refundedMinor), note: `Net received ${inr(data.refundTotals.netReceivedMinor)} \u00b7 ${inr(data.refundTotals.gstMinor)} GST inside` }]
                : []),
              { label: "Net", value: inr(netOf(data)), accent: netOf(data) >= 0, negative: netOf(data) < 0, note: data.refunds.length > 0 ? "Received, less refunds, paid and owed to interns" : "Received, less paid and owed to interns" },
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

          <RefundsPanel refunds={data.refunds} flags={data.refundFlags} inr={inr} />

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
    </section>
  );
}

/** Net = received - refunded - paid to interns - owed to interns. With no refund it is exactly the old figure. */
const netOf = (d: Receivables) => netMinor(d.totals) - d.refundTotals.refundedMinor;

/** Refunds are their own rows (a contra record beside the payment), never a reopened receivable. */
function RefundsPanel({ refunds, flags, inr }: { refunds: Receivables["refunds"]; flags: Receivables["refundFlags"]; inr: (m: number) => string }) {
  if (refunds.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Refunds to companies" description="Money returned to a company. The payment it came from stays as recorded; net received is payments less refunds." />
      {flags.length > 0 ? (
        <div role="note" className="mx-[var(--admin-pad-panel)] mt-3 rounded-2xl border border-[color:var(--admin-rule)] p-3 text-sm text-foreground">
          <p className="font-medium">Refund after payout: decide whether to recover or accept</p>
          <ul className="mt-1 list-disc pl-5 text-text-subtle">
            {flags.map((f) => (
              <li key={f.orderId}>
                {f.companyName ?? "Company"} was refunded {inr(f.refundedInrMinor)}, and {f.internNames.join(", ")} {f.internNames.length === 1 ? "was" : "were"} already paid {inr(f.paidOutInrMinor)}. Nothing was changed automatically.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div tabIndex={0} role="region" aria-label="Refunds" className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <table className="w-full text-left text-sm lg:min-w-[40rem]">
          <thead>
            <tr className="border-b border-[color:var(--admin-rule)]">
              {["Date", "Company", "Refunded", "GST inside", "Credit note", "Reference"].map((h) => (
                <th key={h} scope="col" className={cn("px-3 py-2.5 text-[0.8125rem] font-medium text-text-subtle first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", (h === "Refunded" || h === "GST inside") && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--admin-rule)] last:border-0">
                <td className="nums px-3 py-2.5 first:pl-[var(--admin-pad-panel)] lg:whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-3 py-2.5 [overflow-wrap:anywhere]">{r.companyName ?? "-"}{r.amountNotRecorded ? <span className="block text-xs text-text-subtle">Amount not recorded: whole order counted</span> : null}</td>
                <td className="nums px-3 py-2.5 text-right font-semibold lg:whitespace-nowrap">
                  {formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: false })}
                  {r.currency === "USD" ? <span className="block text-xs font-normal text-text-subtle">{inr(r.inrMinor)}</span> : null}
                </td>
                <td className="nums px-3 py-2.5 text-right lg:whitespace-nowrap">{r.gstInrMinor > 0 ? inr(r.gstInrMinor) : "-"}</td>
                <td className="px-3 py-2.5">{r.creditNote ?? (r.creditNoteNeeded ? <span className="font-medium text-warning">Credit note needed</span> : "-")}</td>
                <td className="nums px-3 py-2.5 text-[0.8125rem] text-text-subtle [overflow-wrap:anywhere] last:pr-[var(--admin-pad-panel)]">{r.reference ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
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
