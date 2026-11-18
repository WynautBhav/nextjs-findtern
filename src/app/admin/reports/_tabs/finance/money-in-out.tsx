import Link from "next/link";

import { Section, StatList } from "@/components/app/stat";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { Ledger } from "@/components/admin/money/ledger";
import { BarTrend } from "@/components/admin/money/rp-bars";
import { Chips, DownloadLink, LoadNote, RP_FIELD, Said, windowWords } from "@/components/admin/money/rp-parts";
import { MONEY_STATUSES, moneyRowFilter, narrowReceivables, type MoneyRow, type Receivables } from "@/lib/admin/receivables";
import { loadReceivables, moneyFilter } from "@/lib/admin/receivables-load";
import { monthlyFlows } from "@/lib/admin/reports-shape";
import { istDayKey, netMinor } from "@/lib/admin/revenue";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

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

/** A real minus sign (U+2212) glued to the figure, never a hyphen that can wrap off it. */
const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" }).replace(/^[-–−]\s*/, "−");
const owed = (text: string, minor: number) => <span className={cn(minor > 0 && "text-signal")}>{text}</span>;

/** Net = received - refunded - paid to interns - owed to interns. With no refund it is exactly the old figure. */
const netOf = (d: Receivables) => netMinor(d.totals) - d.refundTotals.refundedMinor;

/**
 * The old Money in and out report (legacy receivables / payables, routes.ts:5100-5453), now a section of the Finance
 * tab: same loaders, filters, tables and CSV, with the period taken from the tab's window. What the glance above already
 * shows (collected, refunds, stipends paid) is not shown twice; it comes back here only when a filter narrows the report.
 */
export default async function MoneyInOut({ window: w, params }: TabProps) {
  const receivablesFilter = moneyFilter(params.receivables);
  const payablesFilter = moneyFilter(params.payables);
  const rowFilter = moneyRowFilter(params);
  let data: Receivables | null = null;
  try {
    data = narrowReceivables(await loadReceivables({ since: w.since, until: w.until }, { receivables: receivablesFilter, payables: payablesFilter }), rowFilter);
  } catch (error) {
    console.error("[admin/reports/money] load failed", error);
  }
  const view = params.view === "payables" ? "payables" : "receivables";
  const query = new URLSearchParams(params).toString();
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, ...patch });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${BASE}${q.size ? `?${q}` : ""}`;
  };
  const sourceLinks = (key: "receivables" | "payables", current: string) => (
    <Chips
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
  const label = windowWords(w);

  return (
    <section className="space-y-8" data-rp="money-in-out">
      <Section
        title="Money in and out"
        hint="Amounts keep their currency; totals are in INR (USD at ₹100/$). Still to collect and owed are as of today; the rest is for the period."
        action={<DownloadLink href={`/api/admin/reports/money?${query}${query ? "&" : ""}format=csv`} label="Export money in and out as CSV" />}
      >
        {/* Candidate / company / status (ADM-15): one GET form, applies to both tables as you change it (no Filter button, QA-149). */}
        <AutoSubmitForm className="mb-6 flex flex-wrap items-end gap-3">
          {Object.entries(params)
            .filter(([k, v]) => v && !["company", "candidate", "status", "page"].includes(k))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Company
            <input name="company" defaultValue={rowFilter.company} placeholder="Any company" className={cn(RP_FIELD, "w-48")} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Candidate
            <input name="candidate" defaultValue={rowFilter.candidate} placeholder="Any candidate" className={cn(RP_FIELD, "w-48")} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Status
            <select name="status" defaultValue={rowFilter.status} className={RP_FIELD}>
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
            <Link href={link({ company: "", candidate: "", status: "" })} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11">
              Clear filters
            </Link>
          ) : null}
        </AutoSubmitForm>

        {data ? (
          <div className="space-y-10 lg:space-y-12">
            <StatList
              items={[
                { label: "Still to collect", value: owed(inr(data.totals.dueMinor), data.totals.dueMinor), hint: `Accepted offers and instalments, as of today: ${inr(overdueMinor)} past its date, plus ${inr(data.totals.prospectMinor)} in unpaid activation fees.` },
                { label: "Owed to interns", value: owed(inr(data.totals.owedMinor), data.totals.owedMinor), hint: `${inr(pendingPayableMinor)} in pending payouts and ${inr(data.totals.owedMinor - pendingPayableMinor)} in stipend months ahead.` },
                { label: "Left after payouts", value: inr(netOf(data)), hint: `Received${data.refunds.length > 0 ? ", less refunds," : ","} less paid and owed to interns. Not the same as net of refunds above.` },
                ...(filtered
                  ? [
                      { label: "Received in this filter", value: inr(data.totals.receivedMinor), hint: `Paid orders and activation fees ${label} that match the filter.` },
                      { label: "Paid to interns in this filter", value: inr(data.totals.paidOutMinor), hint: "Stipend payouts marked paid." },
                    ]
                  : []),
                ...(filtered && data.refunds.length > 0 ? [{ label: "Refunded to companies", value: inr(data.refundTotals.refundedMinor), hint: `Net received ${inr(data.refundTotals.netReceivedMinor)}; ${inr(data.refundTotals.gstMinor)} GST inside.` }] : []),
              ]}
            />

            <Section title="Is more money coming in than going out?" hint="Cash that actually moved per month in this period: payments received and stipends paid to interns. Due and upcoming amounts are not included.">
              <BarTrend
                ariaLabel="Cash in and out per month"
                bucket="month"
                unit="received in a month"
                valueHeader="Received"
                format={(n) => formatMoney(n, "INR", { short: true, zeroLabel: "₹0" })}
                rows={flows.map((f) => ({ key: f.key, label: f.label, value: f.inMinor, display: inr(f.inMinor) }))}
                extras={[{ header: "Paid to interns", cells: flows.map((f) => (f.outMinor === 0 ? "none" : inr(f.outMinor))) }]}
                emptyText="No cash moved in this period. Pick a longer period above."
              />
            </Section>

            <RefundsSection refunds={data.refunds} flags={data.refundFlags} />

            <MoneyTable
              title={view === "receivables" ? "Receivables" : "Payables"}
              description={view === "receivables" ? "Money coming in, newest first." : "Stipends going out to interns, newest first."}
              rows={view === "receivables" ? data.receivables : data.payables}
              filter={view === "receivables" ? sourceLinks("receivables", receivablesFilter) : sourceLinks("payables", payablesFilter)}
              filtered={filtered}
              expanded={params.rows === "all"}
              tabs={
                <Chips
                  label="Table"
                  items={[
                    { href: link({ view: "", rows: "" }), label: `Receivables (${formatNumber(data.receivables.length)})`, current: view === "receivables" },
                    { href: link({ view: "payables", rows: "" }), label: `Payables (${formatNumber(data.payables.length)})`, current: view === "payables" },
                  ]}
                />
              }
              moreHref={link({ rows: "all" })}
            />
          </div>
        ) : (
          <LoadNote what="the money report" retryHref={BASE} />
        )}
      </Section>
    </section>
  );
}

/** Refunds are their own rows (a contra record beside the payment), never a reopened receivable. */
function RefundsSection({ refunds, flags }: { refunds: Receivables["refunds"]; flags: Receivables["refundFlags"] }) {
  if (refunds.length === 0) return null;
  return (
    <Section title="Refunds to companies" hint="Money returned to a company. The payment it came from stays as recorded; net received is payments less refunds.">
      {flags.length > 0 ? (
        <div role="note" className="mb-4 border-y border-ink-300 py-3 text-sm text-ink-900">
          <p className="font-medium">Refund after payout: decide whether to recover or accept</p>
          <ul className="mt-1 list-disc pl-5 text-ink-700">
            {flags.map((f) => (
              <li key={f.orderId}>
                {f.companyName ?? "Company"} was refunded {inr(f.refundedInrMinor)}, and {f.internNames.join(", ")} {f.internNames.length === 1 ? "was" : "were"} already paid {inr(f.paidOutInrMinor)}. Nothing was changed automatically.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Ledger
        caption="Refunds"
        rows={refunds}
        rowKey={(r) => r.id}
        columns={[
          { key: "d", header: "Date", primary: true, cell: (r) => formatDate(r.date), className: "whitespace-nowrap" },
          { key: "c", header: "Company", cell: (r) => (
            <span>
              {r.companyName ?? "–"}
              {r.amountNotRecorded ? <span className="block text-xs text-ink-600">Amount not recorded: whole order counted</span> : null}
            </span>
          ) },
          { key: "r", header: "Refunded", align: "right", className: "whitespace-nowrap", cell: (r) => (
            <span>
              {formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: false })}
              {r.currency === "USD" ? <span className="block text-xs text-ink-600">{inr(r.inrMinor)}</span> : null}
            </span>
          ) },
          { key: "g", header: "GST inside", align: "right", cell: (r) => (r.gstInrMinor > 0 ? inr(r.gstInrMinor) : "–") },
          { key: "n", header: "Credit note", cell: (r) => r.creditNote ?? (r.creditNoteNeeded ? <span className="font-medium text-ink-900">Credit note needed</span> : "–") },
          { key: "f", header: "Reference", cell: (r) => <span className="text-xs text-ink-600 [overflow-wrap:anywhere]">{r.reference ?? ""}</span> },
        ]}
      />
    </Section>
  );
}

function MoneyTable({ title, description, rows, filter, filtered, expanded, tabs, moreHref }: { title: string; description: string; rows: MoneyRow[]; filter: React.ReactNode; filtered: boolean; expanded: boolean; tabs: React.ReactNode; moreHref: string }) {
  const shown = rows.slice(0, expanded ? SHOWN : FIRST_ROWS);
  return (
    <Section title={title} hint={description}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {tabs}
        {filter}
      </div>
      <Ledger
        caption={title}
        rows={shown}
        rowKey={(r) => r.id}
        empty={<Said>{filtered ? "Nothing matches these filters in this range. Clear a filter to see more." : "Nothing in this range. Pick a longer period above."}</Said>}
        columns={[
          { key: "d", header: "Date", primary: true, cell: (r) => formatDate(r.date), className: "whitespace-nowrap" },
          { key: "x", header: "Description", cell: (r) => <span className="[overflow-wrap:anywhere]">{r.description}</span> },
          { key: "c", header: "Company", cell: (r) => r.companyName ?? "–" },
          { key: "n", header: "Candidate", cell: (r) => r.candidateName ?? "–" },
          { key: "s", header: "Status", cell: (r) => <span className={cn(r.status === "due" && "font-medium text-signal")}>{STATUS_LABEL[r.status]}</span> },
          { key: "a", header: "Amount", align: "right", className: "whitespace-nowrap font-medium", cell: (r) => formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: false }) },
          { key: "f", header: "Reference", cell: (r) => <span className="text-xs text-ink-600 [overflow-wrap:anywhere]">{r.reference ?? ""}</span> },
        ]}
      />
      {rows.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-700">
          <span>
            Showing 1{"–"}{formatNumber(shown.length)} of {formatNumber(rows.length)}
            {rows.length > SHOWN ? ". The CSV export has every row." : ""}
          </span>
          {rows.length > shown.length ? (
            <Link href={moreHref} scroll={false} className="font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Show {formatNumber(Math.min(rows.length, SHOWN))} rows
            </Link>
          ) : null}
        </p>
      ) : null}
    </Section>
  );
}
