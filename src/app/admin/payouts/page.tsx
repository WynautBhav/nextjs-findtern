import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { DataTable, parseSort, type Column } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { PayoutEditor } from "@/components/admin/payout-editor";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pill } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { flattenParams, parsePageRequest, toQueryString, type RawSearchParams } from "@/lib/admin/params";
import {
  DUE_FILTERS,
  duesTotals,
  filterDues,
  loadPayouts,
  loadPlacementDues,
  PAYOUT_SORTS,
  payoutSourceLabel,
  type DueFilter,
  type PayoutRow,
  type PlacementDueRow,
} from "@/lib/admin/payout-list";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Intern payouts" };

const BASE = "/admin/payouts";
const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });

/**
 * Money out to interns.
 *
 * Two views over the same money: every payout row (the ledger staff settle
 * against the bank statement), and every hired placement with what is still
 * owed on it - which is where new payouts start, on the candidate's page,
 * because a payout is always one month of one placement (ADP-29).
 */
export default async function AdminPayouts({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const tab = params.tab === "dues" ? "dues" : "payouts";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payouts"
        subtitle="Stipends owed and paid to interns, and what employers have paid for each placement."
      />

      <nav aria-label="Payout views" className="inline-grid grid-cols-2 gap-1 rounded-apple-md bg-ink-100 p-1">
        {(
          [
            { key: "payouts", label: "Payouts" },
            { key: "dues", label: "Dues by placement" },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={`${BASE}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-apple-sm px-4 text-sm font-medium max-lg:min-h-11",
              tab === t.key ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "payouts" ? <PayoutsView params={params} /> : <DuesView params={params} />}
    </div>
  );
}

/* ── Payouts ledger ─────────────────────────────────────────────────── */

async function PayoutsView({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const sort = parseSort(params, PAYOUT_SORTS, { key: "scheduled", dir: "desc" });

  let data: Awaited<ReturnType<typeof loadPayouts>>;
  try {
    data = await loadPayouts(params, { offset: req.offset, limit: req.perPage, sort: sort.key, dir: sort.dir });
  } catch (e) {
    console.error("[admin/payouts]", e);
    return (
      <Panel>
        <AdminLoadError what="payouts" retryHref={`${BASE}${toQueryString(params)}`} />
      </Panel>
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / req.perPage));
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => !["tab", "page", "per"].includes(k)));
  const filtered = Boolean(params.q || params.status || params.currency || params.from || params.to);

  const columns: Column<PayoutRow>[] = [
    {
      header: "Intern",
      cell: (r) => (
        <span className="block min-w-40">
          <Link href={`/admin/interns/${r.internId}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
            {r.internName || "Candidate"}
          </Link>
          {r.internEmail ? <span className="block max-w-56 truncate text-xs text-ink-600">{r.internEmail}</span> : null}
        </span>
      ),
    },
    {
      header: "Company and project",
      cell: (r) =>
        r.companyName ? (
          <span className="block min-w-40">
            {r.employerId ? (
              <Link href={`/admin/companies/${r.employerId}`} className="text-ink-800 underline-offset-4 hover:underline">
                {r.companyName}
              </Link>
            ) : (
              r.companyName
            )}
            {r.projectName ? <span className="block max-w-56 truncate text-xs text-ink-600">{r.projectName}</span> : null}
          </span>
        ) : (
          <span className="text-ink-500">Not linked</span>
        ),
    },
    { header: "Scheduled", sort: "scheduled", className: "nums whitespace-nowrap", cell: (r) => (r.scheduledFor ? formatDate(r.scheduledFor) : "-") },
    {
      header: "Amount",
      sort: "amount",
      align: "right",
      className: "whitespace-nowrap font-semibold text-ink-900",
      cell: (r) => formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" }),
    },
    {
      header: "INR value",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => inr(r.inrMinor),
    },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      header: "Source",
      cell: (r) => (
        <span className="block min-w-32">
          {payoutSourceLabel(r.source)}
          {r.opsNote ? (
            <span className="block max-w-56 truncate text-xs text-ink-600" title={r.opsNote}>
              {r.opsNote}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      header: "Reference",
      className: "nums",
      cell: (r) =>
        r.referenceId ? (
          <span className="block max-w-40 truncate" title={r.referenceId}>
            {r.referenceId}
          </span>
        ) : (
          <span className="text-ink-500">-</span>
        ),
    },
    { header: "Paid on", sort: "paid", className: "nums whitespace-nowrap", cell: (r) => (r.paidAt ? formatDate(r.paidAt) : "-") },
    { header: "Created", sort: "created", className: "nums whitespace-nowrap text-ink-600", cell: (r) => (r.createdAt ? formatDate(r.createdAt) : "-") },
    {
      header: <span className="sr-only">Action</span>,
      cell: (r) => <PayoutEditor payoutId={r.id} status={r.status} initialReference={r.referenceId} initialNote={r.opsNote} />,
    },
  ];

  return (
    <>
      <StatGrid cols={3}>
        <StatCard
          label="Paid out"
          value={inr(data.paidMinor)}
          hint={filtered ? "Matching the filters below" : "All recorded payouts · USD at ₹100/$"}
        />
        <StatCard
          label="Waiting to be paid"
          value={inr(data.pendingMinor)}
          hint={`${data.pendingCount.toLocaleString("en-IN")} pending ${data.pendingCount === 1 ? "payout" : "payouts"}`}
          tone={data.pendingCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Failed transfers"
          value={data.failedCount.toLocaleString("en-IN")}
          hint={data.failedCount > 0 ? "Create a new payout from the placement's dues to retry" : "None"}
          tone={data.failedCount > 0 ? "warning" : "neutral"}
        />
      </StatGrid>

      <DataTable<PayoutRow>
        basePath={BASE}
        params={params}
        page={Math.min(req.page, pages)}
        pages={pages}
        total={data.total}
        perPage={req.perPage}
        rows={data.rows}
        columns={columns}
        noun="payouts"
        caption="Intern payouts"
        searchPlaceholder="Intern, email, reference, company or project"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "pending", label: "Pending" },
              { value: "paid", label: "Paid" },
              { value: "failed", label: "Failed" },
            ],
          },
          {
            key: "currency",
            label: "Currency",
            options: [
              { value: "INR", label: "INR" },
              { value: "USD", label: "USD" },
            ],
          },
        ]}
        extraControls={<DateRange params={params} />}
        exportHref={`/api/admin/payouts/export${toQueryString({ ...exportParams, view: "payouts" })}`}
        empty={
          filtered
            ? { title: "No payouts match", body: "Nothing matches these filters. Clear the search or widen the dates." , action: { href: `${BASE}?tab=payouts`, label: "Clear filters" } }
            : {
                title: "No payouts yet",
                body: "Payouts are created from a hired placement's dues on the candidate's page. Open Dues by placement to see who is owed.",
                action: { href: `${BASE}?tab=dues`, label: "See dues by placement" },
              }
        }
      />
    </>
  );
}

/** Created-date range. A plain GET form, so it works before hydration. */
function DateRange({ params }: { params: Record<string, string> }) {
  const keep = Object.entries(params).filter(([k]) => !["from", "to", "page"].includes(k));
  const field =
    "h-9 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600 max-lg:h-11";
  return (
    <form method="get" action={BASE} className="flex flex-wrap items-end gap-2">
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex flex-col text-xs font-medium text-ink-600">
        Created from
        <input type="date" name="from" defaultValue={params.from ?? ""} className={cn(field, "mt-1")} />
      </label>
      <label className="flex flex-col text-xs font-medium text-ink-600">
        to
        <input type="date" name="to" defaultValue={params.to ?? ""} className={cn(field, "mt-1")} />
      </label>
      <button type="submit" className={buttonClass({ variant: "outline", size: "sm" })}>
        Apply
      </button>
    </form>
  );
}

/* ── Dues by placement ──────────────────────────────────────────────── */

async function DuesView({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const filter = (DUE_FILTERS as readonly string[]).includes(params.due ?? "") ? (params.due as DueFilter) : "all";

  let all: PlacementDueRow[];
  try {
    all = await loadPlacementDues();
  } catch (e) {
    console.error("[admin/payouts dues]", e);
    return (
      <Panel>
        <AdminLoadError what="placement dues" retryHref={`${BASE}${toQueryString(params)}`} />
      </Panel>
    );
  }

  const rows = filterDues(all, filter, params.q ?? "");
  const totals = duesTotals(rows);
  const pages = Math.max(1, Math.ceil(rows.length / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = rows.slice((page - 1) * req.perPage, page * req.perPage);
  const filtered = Boolean(params.q || params.due);
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => ["q", "due"].includes(k)));

  const columns: Column<PlacementDueRow>[] = [
    {
      header: "Intern",
      cell: (d) => (
        <Link href={`/admin/interns/${d.internId}?tab=payments`} className="block min-w-36 font-medium text-ink-900 underline-offset-4 hover:underline">
          {d.internName}
        </Link>
      ),
    },
    {
      header: "Employer and project",
      cell: (d) => (
        <span className="block min-w-40">
          <Link href={`/admin/companies/${d.employerId}`} className="text-ink-800 underline-offset-4 hover:underline">
            {d.companyName}
          </Link>
          <span className="block max-w-56 truncate text-xs text-ink-600">{d.projectName}</span>
        </span>
      ),
    },
    { header: "Start", className: "nums whitespace-nowrap", cell: (d) => (d.startDate ? formatDate(d.startDate) : "-") },
    {
      header: "Months paid",
      className: "whitespace-nowrap",
      cell: (d) => (
        <span className="inline-flex items-center gap-2">
          <span className="nums">
            <span className="font-semibold text-ink-900">{d.paidMonths}</span> of {d.months}
          </span>
          {d.remainingMonths <= 0 ? <Pill tone="paid">Done</Pill> : null}
        </span>
      ),
    },
    {
      header: "Monthly stipend",
      align: "right",
      className: "whitespace-nowrap",
      cell: (d) => (d.monthlyShareMinor > 0 ? inr(d.monthlyShareMinor) : <span className="text-ink-500">None (score below 6)</span>),
    },
    { header: "Total", align: "right", className: "whitespace-nowrap", cell: (d) => inr(d.totalShareMinor) },
    { header: "Paid", align: "right", className: "whitespace-nowrap", cell: (d) => inr(d.paidMinor) },
    {
      header: "Due",
      align: "right",
      className: "whitespace-nowrap font-semibold text-ink-900",
      cell: (d) => (d.remainingMinor > 0 ? inr(d.remainingMinor) : <span className="font-normal text-ink-500">-</span>),
    },
    {
      header: "Next payment",
      className: "nums whitespace-nowrap",
      cell: (d) =>
        d.pending ? (
          <Pill tone="waiting">Payout pending</Pill>
        ) : d.nextDate && d.remainingMinor > 0 ? (
          formatDate(d.nextDate)
        ) : (
          "-"
        ),
    },
    {
      header: "Employer paid",
      cell: (d) =>
        d.employer ? (
          <span className="block min-w-40">
            <span className="nums">
              {d.employer.paidInFull ? "In full" : `${d.employer.paidMonths} of ${d.employer.months} months`}
            </span>
            {d.employer.dueMinor > 0 ? (
              <span className="nums block text-xs text-ink-600">
                {formatMoney(d.employer.dueMinor, d.employer.currency)} still to pay
              </span>
            ) : null}
            {d.aheadOfEmployer ? (
              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-700">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                Next month not paid by employer yet
              </span>
            ) : null}
          </span>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <>
      <StatGrid cols={4}>
        <StatCard label="Owed to interns" value={inr(totals.dueMinor)} hint={filtered ? "Matching the filters below" : "Stipend months not yet paid"} tone={totals.dueMinor > 0 ? "warning" : "neutral"} />
        <StatCard label="Paid to interns" value={inr(totals.paidMinor)} hint={`of ${inr(totals.totalMinor)} across these placements`} />
        <StatCard label="Active placements" value={totals.active.toLocaleString("en-IN")} hint={`${totals.completed.toLocaleString("en-IN")} fully paid`} />
        <StatCard label="Employers still owe" value={inr(totals.employerDueInrMinor)} hint="Stipend base, before fee and GST · USD at ₹100/$" />
      </StatGrid>

      <DataTable<PlacementDueRow>
        basePath={BASE}
        params={params}
        page={page}
        pages={pages}
        total={rows.length}
        perPage={req.perPage}
        rows={shown}
        columns={columns}
        noun="placements"
        caption="Stipend dues by hired placement"
        searchPlaceholder="Intern, employer or project"
        filters={[
          {
            key: "due",
            label: "Placements",
            allLabel: "All placements",
            options: [
              { value: "active", label: "Active" },
              { value: "upcoming", label: "Has a payment due" },
              { value: "completed", label: "Completed" },
            ],
          },
        ]}
        exportHref={`/api/admin/payouts/export${toQueryString({ ...exportParams, view: "dues" })}`}
        empty={
          filtered
            ? { title: "No placements match", body: "Nothing matches this search or filter.", action: { href: `${BASE}?tab=dues`, label: "Clear filters" } }
            : { title: "No hired placements yet", body: "Once an employer pays for a hire, the placement and its stipend months appear here." }
        }
      />
      <p className="text-sm text-ink-600">
        To pay a month, open the intern and use <span className="font-medium text-ink-800">Create payout</span> on the placement&apos;s row: it is prefilled with the
        month owed and refuses a second payout while one is pending.
      </p>
    </>
  );
}
