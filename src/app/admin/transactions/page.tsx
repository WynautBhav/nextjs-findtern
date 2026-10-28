import { and, asc, count, desc, eq, gte, sql, type AnyColumn, type SQL, type SQLWrapper } from "drizzle-orm";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, PERIOD_OPTIONS, periodStart, searchAny, toPage, type RawSearchParams } from "@/lib/admin/params";
import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable, parseSort } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ChipLinks, DateRangeForm } from "@/components/admin/report-range";
import { dateRangeConditions } from "@/lib/admin/date-range";
import { gatewayLabel } from "@/lib/admin/invoice-rows";
import { inrMinorSql } from "@/lib/admin/scope";
import { PayoutEditor } from "@/components/admin/payout-editor";
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
  const db = getDb();
  const [[paymentMetrics], [payoutMetrics], [pending]] = await Promise.all([
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
    db.select({ c: count() }).from(schema.internPayouts).where(eq(schema.internPayouts.status, "pending")),
  ]);
  return {
    inflowMinor: Number(paymentMetrics?.totalAmount ?? 0),
    inflowCount: Number(paymentMetrics?.paidCount ?? 0),
    outflowMinor: Number(payoutMetrics?.totalAmount ?? 0),
    outflowPaid: Number(payoutMetrics?.paidCount ?? 0),
    outflowTotal: Number(payoutMetrics?.totalCount ?? 0),
    pendingPayouts: Number(pending?.c ?? 0),
  };
}

/** Monthly collected revenue (6 months) and daily paid volume (7 days), India time. */
async function loadCharts(): Promise<{ revenue: RevenuePoint[]; volume: VolumePoint[] }> {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    revenue: Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { label: d.toLocaleString("en-IN", { month: "short" }), totalMinor: monthly.get(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)?.total ?? 0 };
    }),
    volume: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
      const hit = daily.get(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      return { label: d.toLocaleString("en-IN", { weekday: "short" }), count: hit?.n ?? 0, totalMinor: hit?.total ?? 0 };
    }),
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
    <div className="space-y-8">
      <AdminPageHeader title="Transactions" subtitle="Money received from employers and interns, and stipends paid out to interns." />

      {metrics ? (
        <StatGrid cols={4}>
          <StatCard
            label="Received"
            value={formatMoney(metrics.inflowMinor, "INR", { compact: true, zeroLabel: "₹0" })}
            hint={`${formatNumber(metrics.inflowCount)} paid receipts · USD at ₹100/$`}
            icon={ArrowDownLeft}
          />
          <StatCard
            label="Paid out to interns"
            value={formatMoney(metrics.outflowMinor, "INR", { compact: true, zeroLabel: "₹0" })}
            hint={`${formatNumber(metrics.outflowPaid)} of ${formatNumber(metrics.outflowTotal)} payouts settled`}
            icon={ArrowUpRight}
          />
          <StatCard
            label="Payouts pending"
            value={formatNumber(metrics.pendingPayouts)}
            hint="Waiting for a bank reference"
            icon={Clock}
            href="/admin/transactions?view=payouts&status=pending"
          />
          <StatCard
            label="Settlement rate"
            value={metrics.outflowTotal ? `${Math.round((metrics.outflowPaid / metrics.outflowTotal) * 100)}%` : "-"}
            hint={metrics.outflowTotal ? "Payouts settled of all recorded" : "No payouts recorded yet"}
            icon={CheckCircle2}
          />
        </StatGrid>
      ) : (
        <Panel>
          <AdminLoadError what="the ledger totals" retryHref="/admin/transactions" />
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
            description="Bar height is the number of paid transactions that day (India time); hover a bar for the amount."
          />
          <PanelBody>{charts ? <VolumeBars data={charts.volume} /> : <ChartError />}</PanelBody>
        </Panel>
      </div>

      <section className="space-y-3">
        <ChipLinks
          label="Ledger view"
          items={[
            { href: "/admin/transactions", label: "Employer payments", current: view === "employer" },
            { href: "/admin/transactions?source=intern", label: "Intern fees", current: view === "intern" },
            { href: "/admin/transactions?view=payouts", label: "Intern payouts", current: view === "payouts" },
          ]}
        />
        {table}
      </section>
    </div>
  );
}

function ChartError() {
  return <p className="py-12 text-center text-sm text-danger">This chart couldn&apos;t be loaded. The tables below are unaffected.</p>;
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
          cell: (row) => (
            <div className="min-w-0 max-w-60">
              <Link href={`/admin/companies/${row.employerId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {row.companyName}
              </Link>
              <p className="truncate text-xs text-ink-600">{row.companyEmail}</p>
            </div>
          ),
        },
        { header: "Amount", align: "right", sort: "amount", cell: (row) => <span className="font-semibold text-ink-900">{money(row.amountMinor, row.currency)}</span> },
        { header: "Gateway", cell: (row) => gatewayLabel(row.gateway) },
        { header: "Order ID", cell: (row) => <span className="font-mono text-xs text-ink-700">{row.orderId}</span> },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", align: "right", sort: "date", cell: (row) => formatDate((row.paidAt ?? row.createdAt)?.toISOString() ?? null) },
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
          cell: (row) => (
            <div className="min-w-0 max-w-60">
              <Link href={`/admin/interns/${row.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {row.name.trim() || "Candidate"}
              </Link>
              <p className="truncate text-xs text-ink-600">{row.email}</p>
            </div>
          ),
        },
        { header: "Amount", align: "right", sort: "amount", cell: (row) => <span className="font-semibold text-ink-900">{money(row.amountMinor, row.currency)}</span> },
        { header: "Gateway", cell: (row) => gatewayLabel(row.gateway) },
        { header: "Order ID", cell: (row) => <span className="font-mono text-xs text-ink-700">{row.orderId}</span> },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", align: "right", sort: "date", cell: (row) => formatDate((row.paidAt ?? row.createdAt)?.toISOString() ?? null) },
      ]}
    />
  );
}

async function PayoutsTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
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
          cell: (row) => (
            <div className="min-w-0 max-w-60">
              <Link href={`/admin/interns/${row.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {row.name.trim() || "Candidate"}
              </Link>
              <p className="truncate text-xs text-ink-600">{row.company || row.email}</p>
            </div>
          ),
        },
        { header: "Amount", align: "right", sort: "amount", cell: (row) => <span className="font-semibold text-ink-900">{money(row.amountMinor, row.currency)}</span> },
        { header: "Method", cell: (row) => (row.method ? row.method.toUpperCase() : "-") },
        { header: "Bank reference", cell: (row) => <span className="font-mono text-xs text-ink-700">{row.referenceId || "Not yet"}</span> },
        { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
        { header: "Date", align: "right", sort: "date", cell: (row) => (row.paidAt ? `Paid ${formatDate(row.paidAt.toISOString())}` : formatDate(row.createdAt?.toISOString() ?? null)) },
        {
          header: "Update",
          cell: (row) => (row.status === "pending" ? <PayoutEditor payoutId={row.id} initialReference={row.referenceId} status={row.status} /> : <span className="text-ink-500">-</span>),
        },
      ]}
    />
  );
}
