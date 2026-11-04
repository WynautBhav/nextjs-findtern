import { and, asc, count, desc, eq, gte, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, PERIOD_OPTIONS, periodStart, searchAny, toPage, type RawSearchParams } from "@/lib/admin/params";
import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { ButtonLink } from "@/components/ui/button";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { DateRangeForm } from "@/components/admin/report-range";
import { dateRangeConditions } from "@/lib/admin/date-range";
import { gatewayLabel } from "@/lib/admin/invoice-rows";
import { fillBuckets, istDayKeys, istMonthKeys, istMonthLabel, istWeekdayLabel } from "@/lib/admin/revenue";
import { loadCollected, loadPayoutTotals, loadReceiptBuckets } from "@/lib/admin/receivables-load";
import { PayoutEditor } from "@/components/admin/payout-editor";
import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { RevenueChart, VolumeBars, type RevenuePoint, type VolumePoint } from "@/components/admin/finance-charts";

/**
 * Financial ledger: money in (employer orders, intern fees) and money out
 * (intern payouts), one tab each. Every list filter, the custom date range
 * and the column sort are URL params, and the CSV export reads the same
 * params, so the file is the population on screen (ADM-07).
 */

type View = "employer" | "intern" | "payouts";

const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });

async function loadMetrics() {
  // Received = paid rows (employer orders + intern fees), outflow = settled payouts; one definition in lib/admin/revenue.
  const [collected, payouts] = await Promise.all([loadCollected(), loadPayoutTotals()]);
  return {
    inflowMinor: collected.receivedMinor,
    inflowCount: collected.receivedCount,
    outflowMinor: payouts.paidOutMinor,
    outflowPaid: payouts.paidOutCount,
    outflowTotal: payouts.totalCount,
    pendingPayouts: payouts.pendingCount,
  };
}

/** Monthly collected revenue (6 India months) and daily paid volume (7 India days). */
async function loadCharts(): Promise<{ revenue: RevenuePoint[]; volume: VolumePoint[] }> {
  const now = new Date();
  const [monthly, daily] = await Promise.all([loadReceiptBuckets("month", 6, now), loadReceiptBuckets("day", 7, now)]);
  return {
    revenue: fillBuckets(istMonthKeys(now, 6), monthly).map((b) => ({ label: istMonthLabel(b.key), totalMinor: b.totalMinor })),
    volume: fillBuckets(istDayKeys(now, 7), daily).map((b) => ({ label: istWeekdayLabel(b.key), count: b.count, totalMinor: b.totalMinor })),
  };
}

export default async function AdminTransactionsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  // `?view=payouts` and `?source=intern` are the old links; both still land.
  const view: View = params.view === "payouts" ? "payouts" : params.source === "intern" ? "intern" : "employer";

  const [metrics, charts] = await Promise.all([
    loadMetrics().catch((error) => {
      console.error("[admin/transactions] metrics failed", error);
      return null;
    }),
    loadCharts().catch((error) => {
      console.error("[admin/transactions] charts failed", error);
      return null;
    }),
  ]);

  let table: React.ReactNode;
  try {
    table = view === "payouts" ? await PayoutsTable({ params }) : view === "intern" ? await InternFeesTable({ params }) : await EmployerPaymentsTable({ params });
  } catch (error) {
    console.error("[admin/transactions] list failed", error);
    table = (
      <Panel>
        <AdminLoadError what="the ledger" retryHref="/admin/transactions" />
      </Panel>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <AdminPageHeader
        title="Transactions"
        subtitle={
          metrics
            ? `${formatMoney(metrics.inflowMinor, "INR", { zeroLabel: "₹0" })} received, ${formatMoney(metrics.outflowMinor, "INR", { zeroLabel: "₹0" })} paid out to interns, ${formatNumber(metrics.pendingPayouts)} ${metrics.pendingPayouts === 1 ? "payout" : "payouts"} waiting for a bank reference.`
            : "Money in from employers and interns, and money out to interns."
        }
        action={
          <ButtonLink href="/admin/reports/money" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
            Money in and out
          </ButtonLink>
        }
      />

      {metrics ? (
        <StatGrid cols={4}>
          <StatCard
            label="Received"
            featured
            value={formatMoney(metrics.inflowMinor, "INR", { zeroLabel: "₹0" })}
            hint={`${formatNumber(metrics.inflowCount)} paid receipts · USD at ₹100/$`}
          />
          <StatCard
            label="Paid out to interns"
            value={formatMoney(metrics.outflowMinor, "INR", { zeroLabel: "₹0" })}
            hint={`${formatNumber(metrics.outflowPaid)} of ${formatNumber(metrics.outflowTotal)} payouts settled`}
          />
          <StatCard
            label="Payouts pending"
            value={formatNumber(metrics.pendingPayouts)}
            hint="Waiting for a bank reference"
            href="/admin/transactions?view=payouts&status=pending"
          />
          <StatCard
            label="Settlement rate"
            value={metrics.outflowTotal ? `${Math.round((metrics.outflowPaid / metrics.outflowTotal) * 100)}%` : "-"}
            hint={metrics.outflowTotal ? "Payouts settled of all recorded" : "No payouts recorded yet"}
          />
        </StatGrid>
      ) : (
        <Panel>
          <AdminLoadError what="the ledger totals" retryHref="/admin/transactions" />
        </Panel>
      )}

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Revenue collected"
            description="Each point is one month's paid employer orders plus intern fees, in INR. A dip means less money arrived that month, not refunds."
          />
          <PanelBody>{charts ? <RevenueChart data={charts.revenue} /> : <ChartError />}</PanelBody>
        </Panel>
        <Panel>
          <PanelHeader
            title="Payments, last 7 days"
            description="Bar height is the number of paid transactions that day (India time). Today is filled, empty days are hatched."
          />
          <PanelBody>{charts ? <VolumeBars data={charts.volume} /> : <ChartError />}</PanelBody>
        </Panel>
      </div>

      <section className="space-y-4">
        <AdminTabs
          label="Ledger view"
          active={view}
          items={[
            { key: "employer", href: "/admin/transactions", label: "Employer payments" },
            { key: "intern", href: "/admin/transactions?source=intern", label: "Intern fees" },
            { key: "payouts", href: "/admin/transactions?view=payouts", label: "Intern payouts" },
          ]}
        />
        {table}
      </section>
    </div>
  );
}

function ChartError() {
  return <p className="py-12 text-center text-sm font-medium text-danger">This chart couldn&apos;t be loaded. The tables below are unaffected.</p>;
}

function exportHref(type: string, params: Record<string, string>) {
  const q = new URLSearchParams({ ...params, type });
  q.delete("page");
  return `/api/admin/export?${q.toString()}`;
}

const STATUS_FILTER = {
  key: "status",
  label: "Status",
  options: [
    { value: "paid", label: "Paid" },
    { value: "created", label: "Created" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ],
};

function order(params: Record<string, string>, amount: AnyColumn, created: AnyColumn) {
  const s = parseSort(params, ["date", "amount"] as const, { key: "date", dir: "desc" });
  const col = s.key === "amount" ? amount : created;
  return s.dir === "asc" ? asc(col) : desc(col);
}

async function EmployerPaymentsTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const req = parsePageRequest(params);
  const conditions = [
    searchAny([sql`${schema.employers.companyName}`, sql`${schema.employerPayments.orderId}`, sql`coalesce(${schema.employerPayments.paymentId}, '')`, sql`coalesce(${schema.employerPayments.invoiceNumber}, '')`], req.search),
    params.status ? eq(schema.employerPayments.status, params.status) : undefined,
    params.currency ? eq(schema.employerPayments.currency, params.currency) : undefined,
    periodStart(params.period) ? gte(schema.employerPayments.createdAt, periodStart(params.period)!) : undefined,
    ...dateRangeConditions(schema.employerPayments.createdAt, params),
  ].filter(Boolean) as SQL[];
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.employerPayments.id,
        orderId: schema.employerPayments.orderId,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        gateway: schema.employerPayments.gateway,
        status: schema.employerPayments.status,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
        employerId: schema.employerPayments.employerId,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
      })
      .from(schema.employerPayments)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
      .where(where)
      .orderBy(order(params, schema.employerPayments.amountMinor, schema.employerPayments.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.employerPayments).innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId)).where(where),
  ]);
  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <DataTable
      basePath="/admin/transactions"
      params={params}
      page={page.page}
      pages={page.pages}
      total={page.total}
      perPage={page.perPage}
      rows={rows}
      noun="employer payments"
      caption="Employer payments"
      searchPlaceholder="Search company, invoice, order or payment ID…"
      exportHref={exportHref("payments", params)}
      extraControls={<DateRangeForm params={params} />}
      filters={[
        STATUS_FILTER,
        { key: "currency", label: "Currency", options: [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }] },
        { key: "period", label: "Period", options: PERIOD_OPTIONS },
      ]}
      empty={{ title: "No employer payments match", body: "Clear a filter or widen the dates.", action: { href: "/admin/transactions", label: "Clear filters" } }}
      columns={[
        {
          header: "Company",
          cell: (row) => <IdentityCell name={row.companyName} id={row.employerId} sub={row.companyEmail} href={`/admin/companies/${row.employerId}`} />,
        },
        { header: "Amount", numeric: true, sort: "amount", cell: (row) => <span className="font-semibold">{money(row.amountMinor, row.currency)}</span> },
        { header: "Gateway", cell: (row) => gatewayLabel(row.gateway) },
        { header: "Order ID", cell: (row) => <span className="nums break-all text-[0.8125rem] text-text-subtle">{row.orderId}</span> },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", numeric: true, sort: "date", cell: (row) => formatDate((row.paidAt ?? row.createdAt)?.toISOString() ?? null) },
      ]}
    />
  );
}

async function InternFeesTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const req = parsePageRequest(params);
  const conditions = [
    searchAny(
      [sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayments.orderId}`, sql`coalesce(${schema.internPayments.paymentId}, '')`, sql`coalesce(${schema.internPayments.invoiceNumber}, '')`],
      req.search,
    ),
    params.status ? eq(schema.internPayments.status, params.status) : undefined,
    periodStart(params.period) ? gte(schema.internPayments.createdAt, periodStart(params.period)!) : undefined,
    ...dateRangeConditions(schema.internPayments.createdAt, params),
  ].filter(Boolean) as SQL[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.internPayments.id,
        internId: schema.internPayments.internId,
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
      .where(where)
      .orderBy(order(params, schema.internPayments.amountMinor, schema.internPayments.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.internPayments).innerJoin(schema.users, eq(schema.users.id, schema.internPayments.internId)).where(where),
  ]);
  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <DataTable
      basePath="/admin/transactions"
      params={params}
      page={page.page}
      pages={page.pages}
      total={page.total}
      perPage={page.perPage}
      rows={rows}
      noun="intern payments"
      caption="Intern activation payments"
      searchPlaceholder="Search intern, invoice, order or payment ID…"
      exportHref={exportHref("intern-payments", params)}
      extraControls={<DateRangeForm params={params} />}
      filters={[STATUS_FILTER, { key: "period", label: "Period", options: PERIOD_OPTIONS }]}
      empty={{ title: "No intern payments match", body: "Clear a filter or widen the dates.", action: { href: "/admin/transactions?source=intern", label: "Clear filters" } }}
      columns={[
        {
          header: "Intern",
          cell: (row) => <IdentityCell name={row.name.trim() || "Candidate"} id={row.internId} sub={row.email} href={`/admin/interns/${row.internId}`} />,
        },
        { header: "Amount", numeric: true, sort: "amount", cell: (row) => <span className="font-semibold">{money(row.amountMinor, row.currency)}</span> },
        { header: "Gateway", cell: (row) => gatewayLabel(row.gateway) },
        { header: "Order ID", cell: (row) => <span className="nums break-all text-[0.8125rem] text-text-subtle">{row.orderId}</span> },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", numeric: true, sort: "date", cell: (row) => formatDate((row.paidAt ?? row.createdAt)?.toISOString() ?? null) },
      ]}
    />
  );
}

async function PayoutsTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const canPay = allows((await getSession())?.permissions, ["transactions:write"]);
  const req = parsePageRequest(params);
  const company = sql`coalesce((select e.company_name from ${schema.employers} e where e.id::text = ${q(schema.internPayouts, schema.internPayouts.raw)}->>'employerId'), '')`;
  const conditions = [
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`coalesce(${schema.internPayouts.referenceId}, '')`, company], req.search),
    params.status ? eq(schema.internPayouts.status, params.status) : undefined,
    ...dateRangeConditions(schema.internPayouts.createdAt, params),
  ].filter(Boolean) as SQL[];
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.internPayouts.id,
        internId: schema.internPayouts.internId,
        amountMinor: schema.internPayouts.amountMinor,
        currency: schema.internPayouts.currency,
        status: schema.internPayouts.status,
        method: schema.internPayouts.method,
        referenceId: schema.internPayouts.referenceId,
        paidAt: schema.internPayouts.paidAt,
        createdAt: schema.internPayouts.createdAt,
        company: sql<string>`${company}`,
        name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
        email: schema.users.email,
      })
      .from(schema.internPayouts)
      .innerJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
      .where(where)
      .orderBy(order(params, schema.internPayouts.amountMinor, schema.internPayouts.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.internPayouts).innerJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId)).where(where),
  ]);
  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <DataTable
      basePath="/admin/transactions"
      params={params}
      page={page.page}
      pages={page.pages}
      total={page.total}
      perPage={page.perPage}
      rows={rows}
      noun="payouts"
      caption="Intern payouts"
      searchPlaceholder="Search intern, company or bank reference…"
      exportHref={exportHref("payouts", params)}
      extraControls={<DateRangeForm params={params} />}
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
      empty={{
        title: "No payouts match",
        body: "Payouts are recorded from an intern's record or the Intern disbursements page.",
        action: { href: "/admin/payouts", label: "Open disbursements" },
      }}
      columns={[
        {
          header: "Intern",
          cell: (row) => <IdentityCell name={row.name.trim() || "Candidate"} id={row.internId} sub={row.company || row.email} href={`/admin/interns/${row.internId}`} />,
        },
        { header: "Amount", numeric: true, sort: "amount", cell: (row) => <span className="font-semibold">{money(row.amountMinor, row.currency)}</span> },
        { header: "Method", cell: (row) => (row.method ? row.method.toUpperCase() : <span className="text-text-subtle">-</span>) },
        { header: "Bank reference", cell: (row) => (row.referenceId ? <span className="nums break-all text-[0.8125rem] text-text-subtle">{row.referenceId}</span> : <span className="text-text-subtle">Not yet</span>) },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", numeric: true, sort: "date", cell: (row) => (row.paidAt ? `Paid ${formatDate(row.paidAt.toISOString())}` : formatDate(row.createdAt?.toISOString() ?? null)) },
        {
          header: "Update",
          cell: (row) => (canPay && row.status === "pending" ? <PayoutEditor payoutId={row.id} initialReference={row.referenceId} status={row.status} /> : <span className="text-text-subtle">-</span>),
        },
      ]}
    />
  );
}
