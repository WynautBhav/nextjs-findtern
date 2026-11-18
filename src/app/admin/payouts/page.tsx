import type { Metadata } from "next";
import { cache, Suspense } from "react";
import Link from "next/link";

import { parseSort } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { PayoutEditor } from "@/components/admin/payout-editor";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonLink } from "@/components/ui/button";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { Pager } from "@/components/admin/pagination";
import { Ledger, Money } from "@/components/admin/money/ledger";
import { PoFigures } from "@/components/admin/money/po-figures";
import { Flag, PayoutStatus, Person, PoToolbar, subLink } from "@/components/admin/money/po-parts";
import { PoLedger, type PoColumn } from "@/components/admin/money/po-ledger";
import { relative } from "@/components/admin/money/po-model";
import { PayoutRunLedger } from "@/components/admin/money/po-run";
import { EmptyScene } from "@/components/app/primitives";
import { Section } from "@/components/app/stat";
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
import { payoutKindLabel } from "@/lib/admin/payout-kind";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { allows } from "@/lib/admin/permissions";

export const metadata: Metadata = { title: "Intern payouts" };

const BASE = "/admin/payouts";
const DUES_HREF = `${BASE}?tab=dues`;

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
    <div>
      <AdminPageHeader
        title="Payouts"
        subtitle="Stipend money going out to interns: settle each payout against the bank statement, and see what is still owed on every placement."
        action={
          <ButtonLink href="/admin/transactions?view=payouts" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
            Transactions
          </ButtonLink>
        }
      />

      <Suspense fallback={<RunDeskSkeleton />}>
        <RunDesk />
      </Suspense>

      <div className="mt-14">
        <AdminTabs
          label="Payout views"
          active={tab}
          items={[
            { key: "payouts", label: "Payouts", href: `${BASE}?tab=payouts` },
            { key: "dues", label: "Dues by placement", href: DUES_HREF },
          ]}
        />
        <div className="pt-6">{tab === "payouts" ? <PayoutsView params={params} /> : <DuesView params={params} />}</div>
      </div>
    </div>
  );
}

/** The payout run above both tabs. A failed read hides the figures, never the lists. */
async function RunDesk() {
  const now = new Date();
  let run: PayoutRun | null = null;
  let bonusPaidMinor = 0;
  try {
    // Paid-out comes from the ledger (same source as the "All payouts" totals, stipends only),
    // not from per-placement links, which most paid payouts do not carry.
    const [dues, ledger] = await Promise.all([
      loadDuesOnce(),
      loadPayouts({}, { offset: 0, limit: 1, sort: "scheduled", dir: "desc" }),
    ]);
    run = buildPayoutRun(dues, istDayKey(now), ledger.paidMinor);
    bonusPaidMinor = ledger.bonusPaidMinor;
  } catch (e) {
    console.error("[admin/payouts run]", e);
  }
  return <PayoutRunLedger run={run} now={now} bonusPaidMinor={bonusPaidMinor} dueHref={DUES_HREF} />;
}

function RunDeskSkeleton() {
  return (
    <div aria-hidden className="grid animate-pulse gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div className="space-y-3">
        <div className="h-4 w-48 rounded-sm bg-ink-200" />
        <div className="h-11 w-56 rounded-sm bg-ink-200" />
        <div className="h-4 w-80 rounded-sm bg-ink-200" />
      </div>
      <div className="space-y-3 border-t-2 border-ink-800 pt-4">
        <div className="h-10 rounded-sm bg-ink-200" />
        <div className="h-10 rounded-sm bg-ink-200" />
        <div className="h-10 rounded-sm bg-ink-200" />
      </div>
    </div>
  );
}

/* ── Payouts ledger ─────────────────────────────────────────────────── */

async function PayoutsView({ params }: { params: Record<string, string> }) {
  const canPay = allows((await getSession())?.permissions, ["transactions:write"]);
  const req = parsePageRequest(params);
  const sort = parseSort(params, PAYOUT_SORTS, { key: "scheduled", dir: "desc" });

  let data: Awaited<ReturnType<typeof loadPayouts>>;
  try {
    data = await loadPayouts(params, { offset: req.offset, limit: req.perPage, sort: sort.key, dir: sort.dir });
  } catch (e) {
    console.error("[admin/payouts]", e);
    return <AdminLoadError what="payouts" retryHref={`${BASE}${toQueryString(params)}`} />;
  }

  const pages = Math.max(1, Math.ceil(data.total / req.perPage));
  const page = Math.min(req.page, pages);
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => !["tab", "page", "per"].includes(k)));
  const filtered = Boolean(params.q || params.status || params.currency || params.from || params.to);

  // Six columns, so the action (record the bank reference: the screen's job)
  // is always on screen at 1440. Company and project, the INR value of a USD
  // payout and the source ride as second lines instead of their own columns,
  // and "Not linked" is simply absent (critique P0, QA-103).
  const columns: PoColumn<PayoutRow>[] = [
    {
      key: "intern",
      header: "Intern",
      primary: true,
      className: "max-w-80",
      cell: (r) => (
        <Person
          name={r.internName || "Candidate"}
          href={`/admin/interns/${r.internId}`}
          sub={
            r.companyName ? (
              <>
                {r.employerId ? (
                  <Link href={`/admin/companies/${r.employerId}`} className={subLink}>
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
      key: "amount",
      header: "Amount",
      sort: "amount",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (
        <>
          <span className="font-semibold text-ink-900">{formatMoney(r.amountMinor, r.currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" })}</span>
          {r.currency === "USD" ? <span className="block text-xs font-normal text-ink-600">{inr(r.inrMinor)}</span> : null}
          <span className={cn("block text-xs", r.kind === "completion_bonus" ? "font-semibold text-ink-900" : "font-normal text-ink-600")}>{payoutKindLabel(r.kind)}</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className="flex flex-col items-start gap-1 max-md:items-end">
          <PayoutStatus status={r.status} />
          <span className="text-xs text-ink-600" title={r.opsNote ?? undefined}>
            {payoutSourceLabel(r.source)}
            {r.opsNote ? ` · ${r.opsNote}` : ""}
            {r.fundedByWaiver ? " · Funded by promo waiver" : ""}
          </span>
        </span>
      ),
    },
    {
      key: "ref",
      header: "Reference",
      className: "nums",
      cell: (r) => (r.referenceId ? <span className="break-all">{r.referenceId}</span> : <span className="text-ink-600">–</span>),
    },
    {
      key: "date",
      header: "Date",
      sort: "paid",
      className: "nums whitespace-nowrap",
      cell: (r) =>
        r.paidAt ? (
          <>Paid {formatDate(r.paidAt)}</>
        ) : r.scheduledFor ? (
          <>Due {formatDate(r.scheduledFor)}</>
        ) : (
          <span className="text-ink-600">Added {r.createdAt ? formatDate(r.createdAt) : "–"}</span>
        ),
    },
    {
      key: "action",
      header: "Action",
      action: true,
      cell: (r) => (canPay ? <PayoutEditor payoutId={r.id} status={r.status} initialReference={r.referenceId} initialNote={r.opsNote} /> : null),
    },
  ];

  return (
    <Section
      title="All payouts"
      hint={filtered ? "Totals cover only the payouts matching the filters below." : "Totals cover every payout, not just this page."}
    >
      <PoFigures
        cols={2}
        items={[
          {
            label: "Paid, stipends",
            hint:
              data.bonusPaidMinor > 0
                ? `Completion bonuses paid apart: ${inr(data.bonusPaidMinor)}. USD at ₹100/$.`
                : "Payouts marked paid. Completion bonuses are counted apart. USD at ₹100/$.",
            value: <Money minor={data.paidMinor} />,
          },
          {
            label: "Waiting for a bank transfer",
            hint: `${data.pendingCount.toLocaleString("en-IN")} ${data.pendingCount === 1 ? "payout" : "payouts"} pending. Payout rows already created, not yet marked paid.`,
            value: <Money minor={data.pendingMinor} />,
            tone: data.pendingCount > 0 ? "signal" : "ink",
          },
        ]}
      />
      <p className="mt-3 text-sm text-ink-700">
        {data.failedCount > 0 ? (
          <>
            <Link href={`${BASE}${toQueryString({ ...params, status: "failed", page: "" })}`} className="font-semibold text-signal underline underline-offset-4">
              {data.failedCount.toLocaleString("en-IN")} failed {data.failedCount === 1 ? "transfer" : "transfers"}
            </Link>
            . Retry from <Link href={DUES_HREF} className="font-medium text-ink-900 underline underline-offset-4">Dues by placement</Link>.
          </>
        ) : (
          "No failed transfers."
        )}
      </p>

      <div className="mt-8">
        <PoToolbar
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
          extra={<DateRangeForm params={params} fromLabel="Created from" />}
          exportHref={`/api/admin/payouts/export${toQueryString({ ...exportParams, view: "payouts" })}`}
          sortOptions={[
            { value: "amount", label: "Amount" },
            { value: "paid", label: "Paid date" },
          ]}
        />
        {data.rows.length === 0 ? (
          filtered ? (
            <EmptyScene title="No payouts match" body="Nothing matches these filters. Clear the search or widen the dates." next={{ label: "Clear filters", href: `${BASE}?tab=payouts` }} />
          ) : (
            <EmptyScene
              title="No payouts yet"
              body="Payouts are created from a hired placement's dues on the candidate's page. Open Dues by placement to see who is owed."
              next={{ label: "See dues by placement", href: DUES_HREF }}
            />
          )
        ) : (
          <PoLedger<PayoutRow> caption="Intern payouts" columns={columns} rows={data.rows} rowKey={(r) => r.id} basePath={BASE} params={params} />
        )}
        <div className="[&>nav]:px-0"><Pager page={page} pages={pages} total={data.total} perPage={req.perPage} rowsShown={data.rows.length} params={params} basePath={BASE} noun="payouts" /></div>
      </div>
    </Section>
  );
}

/* ── Dues by placement ──────────────────────────────────────────────── */

async function DuesView({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const filter = (DUE_FILTERS as readonly string[]).includes(params.due ?? "") ? (params.due as DueFilter) : "all";
  const today = istDayKey(new Date());

  let all: PlacementDueRow[];
  try {
    all = await loadDuesOnce();
  } catch (e) {
    console.error("[admin/payouts dues]", e);
    return <AdminLoadError what="placement dues" retryHref={`${BASE}${toQueryString(params)}`} />;
  }

  const rows = filterDues(all, filter, params.q ?? "");
  const totals = duesTotals(rows);
  const pages = Math.max(1, Math.ceil(rows.length / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = rows.slice((page - 1) * req.perPage, page * req.perPage);
  const filtered = Boolean(params.q || params.due);
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => ["q", "due"].includes(k)));
  const scope = filtered ? "the placements matching the filters" : "every hired placement";

  return (
    <Section title="Dues by placement" hint={`Totals cover ${scope}, not just this page.`}>
      <PoFigures
        cols={2}
        items={[
          { label: "Owed to interns", hint: "Stipend months not yet paid, including months whose payout is already waiting.", value: <Money minor={totals.dueMinor} />, tone: totals.dueMinor > 0 ? "signal" : "ink" },
          { label: "Paid against placements", hint: `Payouts tied to these placements, of ${inr(totals.totalMinor)} in all. A payout with no placement link is not counted here.`, value: <Money minor={totals.paidMinor} /> },
          { label: "Active placements", hint: `${totals.completed.toLocaleString("en-IN")} fully paid.`, value: totals.active.toLocaleString("en-IN") },
          { label: "Employers still owe", hint: "Stipend base, before fee and GST. USD at ₹100/$.", value: <Money minor={totals.employerDueInrMinor} /> },
        ]}
      />

      <div className="mt-8">
        <PoToolbar
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
        />
        {shown.length === 0 ? (
          filtered ? (
            <EmptyScene title="No placements match" body="Nothing matches this search or filter." next={{ label: "Clear filters", href: DUES_HREF }} />
          ) : (
            <EmptyScene title="No hired placements yet" body="Once an employer pays for a hire, the placement and its stipend months appear here." next={{ label: "Open the proposal pipeline", href: "/admin/proposal-tracker" }} />
          )
        ) : (
          <Ledger<PlacementDueRow>
            caption="Stipend dues by hired placement"
            rows={shown}
            rowKey={(d) => d.proposalId}
            columns={[
              {
                key: "placement",
                header: "Placement",
                primary: true,
                className: "max-w-80 align-top",
                cell: (d) => (
                  <Person
                    name={d.internName}
                    href={`/admin/interns/${d.internId}?tab=payments`}
                    sub={
                      <>
                        <span className="block">
                          <Link href={`/admin/companies/${d.employerId}`} className={subLink}>
                            {d.companyName}
                          </Link>
                          {d.projectName ? ` · ${d.projectName}` : ""}
                        </span>
                        {d.startDate ? <span className="nums block text-xs">Started {formatDate(d.startDate)}</span> : null}
                        {d.fundedByWaiver ? <span className="block text-xs">Funded by promo waiver</span> : null}
                      </>
                    }
                  />
                ),
              },
              {
                key: "stipend",
                header: "Stipend",
                align: "right",
                className: "whitespace-nowrap align-top",
                cell: (d) => (
                  <>
                    {d.monthlyShareMinor > 0 ? <span>{inr(d.monthlyShareMinor)}/month</span> : <span className="text-ink-600">None (score below 6)</span>}
                    <span className="nums flex items-center justify-end gap-1.5 text-xs text-ink-600">
                      {d.paidMonths} of {d.months} paid
                      {d.remainingMonths <= 0 ? <StatusBadge tone="success" label="Done" /> : null}
                    </span>
                  </>
                ),
              },
              {
                key: "due",
                header: "Still due",
                align: "right",
                className: "whitespace-nowrap align-top",
                cell: (d) => (
                  <>
                    {d.remainingMinor > 0 ? <span className="font-semibold text-ink-900">{inr(d.remainingMinor)}</span> : <span className="text-ink-600">–</span>}
                    <span className="nums block text-xs text-ink-600">
                      {inr(d.paidMinor)} of {inr(d.totalShareMinor)} paid
                    </span>
                  </>
                ),
              },
              {
                key: "next",
                header: "Next payment",
                className: "nums whitespace-nowrap align-top",
                cell: (d) => {
                  if (d.pending) return <StatusBadge tone="warning" label="Payout pending" />;
                  if (!d.nextDate || d.remainingMinor <= 0) return <span className="text-ink-600">–</span>;
                  const late = d.nextDate < today;
                  return (
                    <>
                      <span className={cn(late && "font-semibold text-signal")}>{formatDate(d.nextDate)}</span>
                      <span className={cn("block text-xs", late ? "font-semibold text-signal" : "text-ink-600")}>{relative(d.nextDate, today)}</span>
                    </>
                  );
                },
              },
              {
                key: "employer",
                header: "Employer paid",
                className: "align-top",
                cell: (d) =>
                  d.employer ? (
                    <span className="block min-w-40">
                      <span className="nums">{d.employer.paidInFull ? "In full" : `${d.employer.paidMonths} of ${d.employer.months} months`}</span>
                      {d.employer.dueMinor > 0 ? (
                        <span className="nums block text-xs text-ink-600">{formatMoney(d.employer.dueMinor, d.employer.currency)} still to pay</span>
                      ) : null}
                      {d.aheadOfEmployer ? <Flag>Next month not paid by employer yet</Flag> : null}
                    </span>
                  ) : (
                    <span className="text-ink-600">–</span>
                  ),
              },
            ]}
          />
        )}
        <div className="[&>nav]:px-0"><Pager page={page} pages={pages} total={rows.length} perPage={req.perPage} rowsShown={shown.length} params={params} basePath={BASE} noun="placements" /></div>
      </div>
      <p className="mt-6 max-w-2xl text-sm text-ink-700">
        To pay a month, open the intern and use <span className="font-medium text-ink-900">Create payout</span> on the placement&apos;s row: it is prefilled with the
        month owed and refuses a second payout while one is pending.
      </p>
    </Section>
  );
}
