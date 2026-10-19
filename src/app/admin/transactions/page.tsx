import { and, asc, count, desc, eq, gte, lt, sql, type AnyColumn, type SQL, type SQLWrapper } from "drizzle-orm";
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { getDb, schema } from "@/lib/db";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, PERIOD_OPTIONS, periodStart, searchAny, toPage } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { inrMinorSql } from "@/lib/admin/scope";
import { PayoutEditor } from "@/components/admin/payout-editor";
import {
  RevenueChart,
  VolumeBars,
  type RevenuePoint,
  type VolumePoint,
} from "@/components/admin/finance-charts";

/**
 * Ledger view switch - the same ink-100 segmented control the payouts and
 * messages pages use, so the console has one tab pattern rather than three.
 */
function LedgerTabs({ current }: { current: "payments" | "payouts" }) {
  const tabs = [
    { key: "payments", label: "Employer payments", href: "/admin/transactions" },
    { key: "payouts", label: "Intern disbursements", href: "/admin/transactions?view=payouts" },
  ] as const;
  return (
    <div
      role="tablist"
      aria-label="Ledger view"
      className="grid grid-cols-2 gap-0.5 self-start overflow-x-auto rounded-[10px] bg-ink-100 p-1 sm:inline-grid sm:grid-cols-2"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          role="tab"
          aria-selected={current === tab.key}
          href={tab.href}
          className={
            current === tab.key
              ? "apple-spring apple-pressable inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[8px] bg-white px-4 text-[14px] font-medium tracking-[-0.01em] text-ink-900 shadow-xs"
              : "apple-spring apple-pressable inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em] text-ink-500 hover:text-ink-800"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const view = params.view === "payouts" ? "payouts" : "payments";
  const req = parsePageRequest(params);

  const db = getDb();

  // Metrics across all transactions
  const [
    [paymentMetrics],
    [payoutMetrics],
    [pendingPayoutsCount],
  ] = await Promise.all([
    // Inflow = money actually received (paid rows only), employer orders plus
    // intern activation fees, USD converted at ₹100/$ - never mixed raw.
    db
      .select({
        totalAmount: sql<number>`(
          coalesce((select sum(${inrMinorSql(sql`ep.amount_minor`, sql`ep.currency`)}) from ${schema.employerPayments} ep where ep.status = 'paid'), 0)
          + coalesce((select sum(${inrMinorSql(sql`ip.amount_minor`, sql`ip.currency`)}) from ${schema.internPayments} ip where ip.status = 'paid'), 0)
        )::bigint`,
        paidCount: sql<number>`(
          (select count(*) from ${schema.employerPayments} ep where ep.status = 'paid')
          + (select count(*) from ${schema.internPayments} ip where ip.status = 'paid')
        )::int`,
        totalCount: sql<number>`1`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({
        // Outflow = payouts that actually left (paid), converted.
        totalAmount: sql<number>`coalesce(sum(case when ${schema.internPayouts.status} = 'paid' then ${inrMinorSql(schema.internPayouts.amountMinor, schema.internPayouts.currency)} end), 0)::bigint`,
        paidCount: sql<number>`coalesce(count(case when ${schema.internPayouts.status} = 'paid' then 1 end), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(schema.internPayouts),
    db
      .select({ c: count() })
      .from(schema.internPayouts)
      .where(eq(schema.internPayouts.status, "pending")),
  ]);


  // ── Chart series: monthly collected revenue + daily volume ────────────────
  // Aggregated in SQL, zero-filled in JS so flat weeks still render axes.
  // Paid rows only - created/failed orders are not money.
  let revenueData: RevenuePoint[] = [];
  let volumeData: VolumePoint[] = [];
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    // Days and months are bucketed in India time (the business's day), and
    // intern activation fees count alongside employer orders.
    const ist = (col: SQLWrapper) => sql`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')`;
    const bucket = (fmt: "month" | "day", since: Date) =>
      Promise.all(
        ([schema.employerPayments, schema.internPayments] as const).map((t) =>
          db
            .select({
              key: sql<string>`to_char(date_trunc(${fmt}, ${ist(t.paidAt)}), ${fmt === "month" ? "YYYY-MM" : "YYYY-MM-DD"})`,
              total: sql<number>`coalesce(sum(${inrMinorSql(t.amountMinor, t.currency)}), 0)::bigint`,
              n: sql<number>`count(*)::int`,
            })
            .from(t)
            .where(and(eq(t.status, "paid"), gte(t.paidAt, since)))
            .groupBy(sql`1`),
        ),
      ).then((sets) => {
        const merged = new Map<string, { total: number; n: number }>();
        for (const row of sets.flat()) {
          const hit = merged.get(row.key) ?? { total: 0, n: 0 };
          merged.set(row.key, { total: hit.total + Number(row.total), n: hit.n + Number(row.n) });
        }
        return merged;
      });
    const [monthly, daily] = await Promise.all([bucket("month", monthStart), bucket("day", weekStart)]);

    const byMonth = new Map([...monthly].map(([k, v]) => [k, v.total]));
    revenueData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        label: d.toLocaleString("en-IN", { month: "short" }),
        totalMinor: byMonth.get(key) ?? 0,
      };
    });

    const byDay = daily;
    volumeData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hit = byDay.get(key);
      return {
        label: d.toLocaleString("en-IN", { weekday: "short" }),
        count: hit?.n ?? 0,
        totalMinor: hit?.total ?? 0,
      };
    });
  } catch {
    // Charts are decoration - the stats and tables below must render anyway.
  }

  if (view === "payouts") {
    // Intern Disbursements View
    const conditions: (SQL | undefined)[] = [
      searchAny(
        [
          sql`${schema.users.firstName}`,
          sql`${schema.users.lastName}`,
          sql`${schema.users.email}`,
          sql`${schema.internPayouts.referenceId}`,
        ],
        req.search,
      ),
      params.status ? eq(schema.internPayouts.status, params.status) : undefined,
    ].filter(Boolean) as SQL[];

    const where = conditions.length
      ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
      : undefined;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: schema.internPayouts.id,
          amountMinor: schema.internPayouts.amountMinor,
          currency: schema.internPayouts.currency,
          status: schema.internPayouts.status,
          method: schema.internPayouts.method,
          referenceId: schema.internPayouts.referenceId,
          notes: schema.internPayouts.notes,
          paidAt: schema.internPayouts.paidAt,
          createdAt: schema.internPayouts.createdAt,
          internFirstName: schema.users.firstName,
          internLastName: schema.users.lastName,
          internEmail: schema.users.email,
        })
        .from(schema.internPayouts)
        .innerJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
        .where(where)
        .orderBy(desc(schema.internPayouts.createdAt))
        .limit(req.perPage)
        .offset(req.offset),
      db
        .select({ c: count() })
        .from(schema.internPayouts)
        .innerJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
        .where(where),
    ]);

    const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Financial Ledger"
          subtitle="Financial settlements, payments collection and intern disbursements."
        />

        <StatGrid cols={4}>
          <StatCard
            label="Inflow volume"
            value={
              Number(paymentMetrics?.totalAmount ?? 0) > 0
                ? formatMoney(Number(paymentMetrics?.totalAmount ?? 0), "INR", { compact: true })
                : "₹0"
            }
            hint={`${formatNumber(paymentMetrics?.paidCount ?? 0)} paid receipts · USD at ₹100/$`}
            icon={ArrowDownLeft}
            tone="brand"
          />
          <StatCard
            label="Outflow payouts"
            value={formatMoney(Number(payoutMetrics?.totalAmount ?? 0), "INR", { compact: true })}
            hint={`${formatNumber(payoutMetrics?.paidCount ?? 0)} paid of ${formatNumber(payoutMetrics?.totalCount ?? 0)} records`}
            icon={ArrowUpRight}
            tone="info"
          />
          <StatCard
            label="Pending payouts"
            value={formatNumber(Number(pendingPayoutsCount?.c ?? 0))}
            hint="Awaiting bank processing"
            icon={Clock}
            tone="accent"
          />
          <StatCard
            label="Settlement rate"
            value={`${payoutMetrics?.totalCount ? Math.round(((payoutMetrics.paidCount ?? 0) / payoutMetrics.totalCount) * 100) : 100}%`}
            hint="Completed without issues"
            icon={CheckCircle2}
            tone="success"
          />
        </StatGrid>

        <FinanceCharts revenueData={revenueData} volumeData={volumeData} />

        <LedgerTabs current="payouts" />

        <DataTable
          basePath="/admin/transactions"
          params={params}
          page={page.page}
          pages={page.pages}
          total={page.total}
          perPage={page.perPage}
          rows={rows}
          noun="payouts"
          caption="Intern payouts list"
          searchPlaceholder="Search recipient or reference ID…"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "paid", label: "Paid" },
                { value: "pending", label: "Pending" },
                { value: "failed", label: "Failed" },
              ],
            },
          ]}
          columns={[
            {
              header: "Recipient",
              cell: (row) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">
                    {row.internFirstName} {row.internLastName}
                  </p>
                  <p className="truncate text-xs text-text-subtle">{row.internEmail}</p>
                </div>
              ),
            },
            {
              header: "Amount",
              align: "right",
              cell: (row) => (
                <span className="font-semibold text-ink-900 tabular-nums">
                  {formatMoney(row.amountMinor, row.currency as "INR")}
                </span>
              ),
            },
            {
              header: "Method",
              cell: (row) => (
                <span className="text-xs uppercase tracking-wider text-ink-700 font-medium">
                  {row.method}
                </span>
              ),
            },
            {
              header: "Reference ID",
              cell: (row) => (
                <span className="font-mono text-xs text-ink-600">
                  {row.referenceId || "Unassigned"}
                </span>
              ),
            },
            {
              header: "Status",
              cell: (row) => <StatusBadge value={row.status} />,
            },
            {
              header: "Settled date",
              cell: (row) => (
                <span className="text-xs text-text-subtle">
                  {row.paidAt ? formatDate(row.paidAt.toISOString()) : "Pending"}
                </span>
              ),
            },
            {
              header: "Update",
              cell: (row) =>
                row.status === "pending" ? (
                  <PayoutEditor payoutId={row.id} initialReference={row.referenceId} />
                ) : (
                  <span className="text-xs text-text-subtle">-</span>
                ),
            },
          ]}
        />
      </div>
    );
  }

  // Payments view: employer orders, or intern activation fees (source=intern).
  const from = params.from && !Number.isNaN(Date.parse(params.from)) ? new Date(params.from) : null;
  const to = params.to && !Number.isNaN(Date.parse(params.to)) ? new Date(Date.parse(params.to) + 86_400_000) : null;
  const dateRange = (col: AnyColumn) =>
    [from ? gte(col, from) : undefined, to ? lt(col, to) : undefined].filter(Boolean) as SQL[];
  const sortOrder = (amount: AnyColumn, created: AnyColumn) =>
    params.sort === "oldest" ? asc(created) : params.sort === "amount_desc" ? desc(amount) : params.sort === "amount_asc" ? asc(amount) : desc(created);
  const source = params.source === "intern" ? "intern" : "employer";
  const extraFilters = [
    { key: "source", label: "Source", options: [{ value: "employer", label: "Employer orders" }, { value: "intern", label: "Intern fees" }] },
    {
      key: "sort",
      label: "Sort",
      options: [
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" },
        { value: "amount_desc", label: "Amount: high to low" },
        { value: "amount_asc", label: "Amount: low to high" },
      ],
    },
  ];
  const dateRangeForm = (
    <form method="get" className="flex flex-wrap items-end gap-1.5 text-[12px] text-ink-600">
      {Object.entries(params)
        .filter(([k]) => k !== "from" && k !== "to" && k !== "page")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label className="flex flex-col">
        From
        <input type="date" name="from" defaultValue={params.from ?? ""} className="mt-0.5 h-9 rounded-lg border border-ink-200 px-2 text-sm" />
      </label>
      <label className="flex flex-col">
        To
        <input type="date" name="to" defaultValue={params.to ?? ""} className="mt-0.5 h-9 rounded-lg border border-ink-200 px-2 text-sm" />
      </label>
      <button type="submit" className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
        Apply dates
      </button>
    </form>
  );

  if (source === "intern") {
    const ipConditions = [
      searchAny(
        [sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayments.orderId}`, sql`${schema.internPayments.paymentId}`],
        req.search,
      ),
      params.status ? eq(schema.internPayments.status, params.status) : undefined,
      periodStart(params.period) ? gte(schema.internPayments.createdAt, periodStart(params.period)!) : undefined,
      ...dateRange(schema.internPayments.createdAt),
    ].filter(Boolean) as SQL[];
    const ipWhere = ipConditions.length ? and(...ipConditions) : undefined;
    const [ipRows, [ipTotal]] = await Promise.all([
      db
        .select({
          id: schema.internPayments.id,
          orderId: schema.internPayments.orderId,
          amountMinor: schema.internPayments.amountMinor,
          currency: schema.internPayments.currency,
          gateway: schema.internPayments.gateway,
          status: schema.internPayments.status,
          paidAt: schema.internPayments.paidAt,
          createdAt: schema.internPayments.createdAt,
          name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
          email: schema.users.email,
        })
        .from(schema.internPayments)
        .innerJoin(schema.users, eq(schema.users.id, schema.internPayments.internId))
        .where(ipWhere)
        .orderBy(sortOrder(schema.internPayments.amountMinor, schema.internPayments.createdAt))
        .limit(req.perPage)
        .offset(req.offset),
      db.select({ c: count() }).from(schema.internPayments).innerJoin(schema.users, eq(schema.users.id, schema.internPayments.internId)).where(ipWhere),
    ]);
    const ipPage = toPage(ipRows, Number(ipTotal?.c ?? 0), req.page, req.perPage);
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Financial Ledger" subtitle="Financial settlements, payments collection and intern disbursements." />
        <FinanceCharts revenueData={revenueData} volumeData={volumeData} />
        <LedgerTabs current="payments" />
        <DataTable
          basePath="/admin/transactions"
          params={params}
          page={ipPage.page}
          pages={ipPage.pages}
          total={ipPage.total}
          perPage={ipPage.perPage}
          rows={ipRows}
          noun="intern payments"
          caption="Intern activation payments"
          searchPlaceholder="Search intern, order ID, or payment ID…"
          exportHref={`/api/admin/export?${new URLSearchParams({ ...params, type: "intern-payments" }).toString()}`}
          extraControls={dateRangeForm}
          filters={[
            ...extraFilters,
            { key: "status", label: "Status", options: [{ value: "paid", label: "Paid" }, { value: "created", label: "Created" }, { value: "failed", label: "Failed" }] },
            { key: "period", label: "Period", options: PERIOD_OPTIONS },
          ]}
          columns={[
            {
              header: "Intern",
              cell: (row) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{row.name}</p>
                  <p className="truncate text-xs text-text-subtle">{row.email}</p>
                </div>
              ),
            },
            {
              header: "Amount",
              align: "right",
              cell: (row) => <span className="font-semibold text-ink-900 tabular-nums">{formatMoney(row.amountMinor, row.currency as "INR")}</span>,
            },
            { header: "Order ID", cell: (row) => <span className="font-mono text-xs text-ink-600">{row.orderId}</span> },
            { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
            {
              header: "Date",
              cell: (row) => (
                <span className="text-xs text-text-subtle">
                  {row.paidAt ? formatDate(row.paidAt.toISOString()) : row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
                </span>
              ),
            },
          ]}
        />
      </div>
    );
  }

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.employers.companyName}`,
        sql`${schema.employerPayments.orderId}`,
        sql`${schema.employerPayments.paymentId}`,
      ],
      req.search,
    ),
    params.status ? eq(schema.employerPayments.status, params.status) : undefined,
    params.currency ? eq(schema.employerPayments.currency, params.currency) : undefined,
    periodStart(params.period) ? gte(schema.employerPayments.createdAt, periodStart(params.period)!) : undefined,
    ...dateRange(schema.employerPayments.createdAt),
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.employerPayments.id,
        orderId: schema.employerPayments.orderId,
        paymentId: schema.employerPayments.paymentId,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        gateway: schema.employerPayments.gateway,
        status: schema.employerPayments.status,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
      })
      .from(schema.employerPayments)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
      .where(where)
      .orderBy(sortOrder(schema.employerPayments.amountMinor, schema.employerPayments.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db
      .select({ c: count() })
      .from(schema.employerPayments)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
      .where(where),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Financial Ledger"
        subtitle="Financial settlements, payments collection and intern disbursements."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Inflow volume"
          value={
            Number(paymentMetrics?.totalAmount ?? 0) > 0
              ? formatMoney(Number(paymentMetrics?.totalAmount ?? 0), "INR", { compact: true })
              : "₹0"
          }
          hint={`${formatNumber(paymentMetrics?.paidCount ?? 0)} paid receipts · USD at ₹100/$`}
          icon={ArrowDownLeft}
          tone="brand"
        />
        <StatCard
          label="Outflow payouts"
          value={formatMoney(Number(payoutMetrics?.totalAmount ?? 0), "INR", { compact: true })}
          hint={`${formatNumber(payoutMetrics?.paidCount ?? 0)} paid of ${formatNumber(payoutMetrics?.totalCount ?? 0)} records`}
          icon={ArrowUpRight}
          tone="info"
        />
        <StatCard
          label="Pending payouts"
          value={formatNumber(Number(pendingPayoutsCount?.c ?? 0))}
          hint="Awaiting bank processing"
          icon={Clock}
          tone="accent"
        />
        <StatCard
          label="Settlement rate"
          value={`${payoutMetrics?.totalCount ? Math.round(((payoutMetrics.paidCount ?? 0) / payoutMetrics.totalCount) * 100) : 100}%`}
          hint="Completed without issues"
          icon={CheckCircle2}
          tone="success"
        />
        </StatGrid>

        <FinanceCharts revenueData={revenueData} volumeData={volumeData} />

      <LedgerTabs current="payments" />

      <DataTable
        basePath="/admin/transactions"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={rows}
        noun="transactions"
        caption="Employer payments list"
        searchPlaceholder="Search company, order ID, or payment ID…"
        exportHref={`/api/admin/export?${new URLSearchParams({ type: "payments", ...params }).toString()}`}
        extraControls={dateRangeForm}
        filters={[
          ...extraFilters,
          {
            key: "status",
            label: "Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "created", label: "Created" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          { key: "currency", label: "Currency", options: [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }] },
          { key: "period", label: "Period", options: PERIOD_OPTIONS },
        ]}
        columns={[
          {
            header: "Company",
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{row.companyName}</p>
                <p className="truncate text-xs text-text-subtle">{row.companyEmail}</p>
              </div>
            ),
          },
          {
            header: "Amount",
            align: "right",
            cell: (row) => (
              <span className="font-semibold text-ink-900 tabular-nums">
                {formatMoney(row.amountMinor, row.currency as "INR")}
              </span>
            ),
          },
          {
            header: "Gateway",
            cell: (row) => (
              <span className="text-xs uppercase tracking-wider text-ink-700 font-medium">
                {row.gateway}
              </span>
            ),
          },
          {
            header: "Order ID",
            cell: (row) => (
              <span className="font-mono text-xs text-ink-600">
                {row.orderId}
              </span>
            ),
          },
          {
            header: "Status",
            cell: (row) => <StatusBadge value={row.status} />,
          },
          {
            header: "Date",
            cell: (row) => (
              <span className="text-xs text-text-subtle">
                {row.paidAt
                  ? formatDate(row.paidAt.toISOString())
                  : row.createdAt
                    ? formatDate(row.createdAt.toISOString())
                    : "None"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * Revenue + volume cards shared by both tabs. Server-rendered shell, client
 * charts inside - the numbers come from the same paid-payments queries above.
 */
function FinanceCharts({
  revenueData,
  volumeData,
}: {
  revenueData: RevenuePoint[];
  volumeData: VolumePoint[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
        <h2 className="text-sm font-semibold text-ink-900">Revenue overview</h2>
        <p className="mt-0.5 text-xs text-text-subtle">Collected revenue · last 6 months</p>
        <div className="mt-4">
          <RevenueChart data={revenueData} />
        </div>
      </section>
      <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
        <h2 className="text-sm font-semibold text-ink-900">Daily transaction volume</h2>
        <p className="mt-0.5 text-xs text-text-subtle">Paid transactions · last 7 days</p>
        <div className="mt-4">
          <VolumeBars data={volumeData} />
        </div>
      </section>
    </div>
  );
}
