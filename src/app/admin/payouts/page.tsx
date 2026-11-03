import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { DataTable, IdentityCell, parseSort, type Column } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { PayoutEditor } from "@/components/admin/payout-editor";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonLink } from "@/components/ui/button";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { PayoutRunDesk } from "@/components/admin/payouts/payout-run-desk";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
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
import { buildPayoutRun, istDayKey, type PayoutRun } from "@/lib/admin/payout-run";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Intern payouts" };

const BASE = "/admin/payouts";

/** One read of the placement dues per request: the run desk and the dues tab share it. */
const loadDuesOnce = cache(loadPlacementDues);
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
        subtitle="Stipend money going out to interns: settle each payout against the bank statement, and see what is still owed on every placement."
        action={
          <ButtonLink href="/admin/transactions?view=payouts" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
            Transactions
          </ButtonLink>
        }
      />

      <RunDesk />

      <AdminTabs
        label="Payout views"
        active={tab}
        items={[
          { key: "payouts", label: "Payouts", href: `${BASE}?tab=payouts` },
          { key: "dues", label: "Dues by placement", href: `${BASE}?tab=dues` },
        ]}
      />

      {tab === "payouts" ? <PayoutsView params={params} /> : <DuesView params={params} />}
    </div>
  );
}

/** The payout run desk above both tabs. A failed read hides the figures, never the lists. */
async function RunDesk() {
  const now = new Date();
  let run: PayoutRun | null = null;
  try {
    run = buildPayoutRun(await loadDuesOnce(), istDayKey(now));
  } catch (e) {
    console.error("[admin/payouts run]", e);
  }
  return <PayoutRunDesk run={run} now={now} />;
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

  // Six columns, so the action (record the bank reference: the screen's job)
  // is always on screen at 1440. Company and project, the INR value of a USD
  // payout and the source ride as second lines instead of their own columns,
  // and "Not linked" is simply absent (critique P0, QA-103).
  const columns: Column<PayoutRow>[] = [
    {
      header: "Intern",
      cell: (r) => (
        <IdentityCell
          name={r.internName || "Candidate"}
          id={r.internId}
          href={`/admin/interns/${r.internId}`}
          className="max-w-72"
          sub={
            r.companyName ? (
              <>
                {r.employerId ? (
                  <Link href={`/admin/companies/${r.employerId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {r.companyName}
                  </Link>
                ) : (
                  r.companyName
                )}
                {r.projectName ? ` · ${r.projectName}` : ""}
              </>
            ) : (
              r.internEmail
            )
          }
        />
      ),
    },
    {
      header: "Amount",
      sort: "amount",
      numeric: true,
      className: "whitespace-nowrap",
      cell: (r) => (
        <>
          <span className="font-semibold text-foreground">{formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" })}</span>
          {r.currency === "USD" ? <span className="block text-xs font-normal text-text-subtle">{inr(r.inrMinor)}</span> : null}
        </>
      ),
    },
    {
      header: "Status",
      cell: (r) => (
        <span className="flex flex-col items-start gap-1 max-lg:items-end">
          <StatusBadge status={r.status} />
          <span className="text-xs text-text-subtle" title={r.opsNote ?? undefined}>
            {payoutSourceLabel(r.source)}
            {r.opsNote ? ` · ${r.opsNote}` : ""}
          </span>
        </span>
      ),
    },
    {
      header: "Reference",
      className: "nums",
      cell: (r) => (r.referenceId ? <span className="break-all">{r.referenceId}</span> : <span className="text-text-subtle">–</span>),
    },
    {
      header: "Date",
      sort: "paid",
      className: "nums whitespace-nowrap",
      cell: (r) =>
        r.paidAt ? (
          <>Paid {formatDate(r.paidAt)}</>
        ) : r.scheduledFor ? (
          <>Due {formatDate(r.scheduledFor)}</>
        ) : (
          <span className="text-text-subtle">Added {r.createdAt ? formatDate(r.createdAt) : "–"}</span>
        ),
    },
    {
      header: <span className="sr-only">Action</span>,
      cell: (r) => <PayoutEditor payoutId={r.id} status={r.status} initialReference={r.referenceId} initialNote={r.opsNote} />,
    },
  ];

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground">All payouts</h2>
      <dl className="grid grid-cols-3 divide-x divide-[color:var(--admin-rule)] rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]">
        <LedgerFigure
          label="Paid out"
          value={inr(data.paidMinor)}
          hint={filtered ? "Matching the filters" : "USD at ₹100/$"}
        />
        <LedgerFigure
          label="Waiting to be paid"
          value={inr(data.pendingMinor)}
          hint={`${data.pendingCount.toLocaleString("en-IN")} pending`}
          warn={data.pendingCount > 0}
        />
        <LedgerFigure
          label="Failed transfers"
          value={data.failedCount.toLocaleString("en-IN")}
          hint={data.failedCount > 0 ? "Retry from Dues by placement" : "None"}
          warn={data.failedCount > 0}
        />
      </dl>

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

/** One figure in the ledger strip; amber only when something is waiting or failed. */
function LedgerFigure({ label, value, hint, warn = false }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
      <dt className="text-xs font-medium text-text-subtle sm:text-sm">{label}</dt>
      <dd className="nums mt-1 truncate text-lg font-semibold leading-none tracking-[-0.02em] text-foreground sm:text-2xl">{value}</dd>
      <dd className={warn ? "mt-1.5 text-xs leading-4 text-warning" : "mt-1.5 text-xs leading-4 text-text-subtle"}>{hint}</dd>
    </div>
  );
}

/** Created-date range (DD/MM/YYYY, applies itself). */
function DateRange({ params }: { params: Record<string, string> }) {
  return <DateRangeForm params={params} fromLabel="Created from" />;
}

/* ── Dues by placement ──────────────────────────────────────────────── */

async function DuesView({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const filter = (DUE_FILTERS as readonly string[]).includes(params.due ?? "") ? (params.due as DueFilter) : "all";

  let all: PlacementDueRow[];
  try {
    all = await loadDuesOnce();
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

  // Five columns (ten ran 220px past 1440): who and where, the stipend and
  // months paid, what is still due against the total.
  const columns: Column<PlacementDueRow>[] = [
    {
      header: "Placement",
      cell: (d) => (
        <IdentityCell
          name={d.internName}
          id={d.internId}
          href={`/admin/interns/${d.internId}?tab=payments`}
          className="max-w-72"
          sub={
            <>
              <span className="block truncate">
                <Link href={`/admin/companies/${d.employerId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {d.companyName}
                </Link>
                {d.projectName ? ` · ${d.projectName}` : ""}
              </span>
              {d.startDate ? <span className="nums block truncate">Started {formatDate(d.startDate)}</span> : null}
            </>
          }
        />
      ),
    },
    {
      header: "Stipend",
      numeric: true,
      cell: (d) => (
        <span className="block whitespace-nowrap">
          {d.monthlyShareMinor > 0 ? (
            <span className="nums">{inr(d.monthlyShareMinor)}/month</span>
          ) : (
            <span className="text-text-subtle">None (score below 6)</span>
          )}
          <span className="nums flex items-center justify-end gap-1.5 text-xs text-text-subtle max-lg:justify-start">
            {d.paidMonths} of {d.months} paid
            {d.remainingMonths <= 0 ? <StatusBadge tone="success" label="Done" /> : null}
          </span>
        </span>
      ),
    },
    {
      header: "Due",
      numeric: true,
      cell: (d) => (
        <span className="block whitespace-nowrap">
          {d.remainingMinor > 0 ? <span className="font-semibold text-foreground">{inr(d.remainingMinor)}</span> : <span className="text-text-subtle">–</span>}
          <span className="nums block text-xs text-text-subtle">
            {inr(d.paidMinor)} of {inr(d.totalShareMinor)} paid
          </span>
        </span>
      ),
    },
    {
      header: "Next payment",
      className: "nums whitespace-nowrap",
      cell: (d) =>
        d.pending ? (
          <StatusBadge tone="warning" label="Payout pending" />
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
              <span className="nums block text-xs text-text-subtle">
                {formatMoney(d.employer.dueMinor, d.employer.currency)} still to pay
              </span>
            ) : null}
            {d.aheadOfEmployer ? (
              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
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
      <h2 className="text-lg font-semibold text-foreground">Dues by placement</h2>
      <StatGrid cols={4}>
        <StatCard featured label="Owed to interns" value={inr(totals.dueMinor)} hint={filtered ? "Matching the filters below" : "Stipend months not yet paid"} tone={totals.dueMinor > 0 ? "warning" : "neutral"} />
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
      <p className="text-sm text-text-subtle">
        To pay a month, open the intern and use <span className="font-medium text-foreground">Create payout</span> on the placement&apos;s row: it is prefilled with the
        month owed and refuses a second payout while one is pending.
      </p>
    </>
  );
}
