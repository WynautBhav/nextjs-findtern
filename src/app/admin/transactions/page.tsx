import { and, asc, count, desc, eq, gte, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, PERIOD_OPTIONS, periodStart, searchAny, toPage, type RawSearchParams } from "@/lib/admin/params";
import Link from "next/link";
import { AdminLoadError } from "@/components/admin/panel";
import { ButtonLink } from "@/components/ui/button";
import { parseSort } from "@/components/admin/data-table";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { RollingNumber } from "@/components/app/rolling-number";
import { FilterTabs } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { AgeCell, Money } from "@/components/admin/money/ledger";
import { RecordsLedger, type RecordColumn } from "@/components/admin/money/records-ledger";
import { StatusChip } from "@/components/admin/money/status-chip";
import { DateRangeForm } from "@/components/admin/report-range";
import { dateRangeConditions } from "@/lib/admin/date-range";
import { displayStatus } from "@/lib/admin/invoice-rows";
import { orderRefunds } from "@/lib/refund-accounting";
import { orderReview } from "@/lib/payment-flags";
import { gatewayLabel } from "@/lib/admin/invoice-rows";
import { payoutKindLabel } from "@/lib/admin/payout-kind";
import { fillBuckets, istDayKeys, istMonthKeys, istMonthLabel, istWeekdayLabel } from "@/lib/admin/revenue";
import { loadCollected, loadPayoutTotals, loadReceiptBuckets, loadRefundedWithin } from "@/lib/admin/receivables-load";
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

type View = "employer" | "intern" | "college" | "payouts";

const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });

async function loadMetrics() {
  // Received = paid rows (employer orders + intern fees), outflow = settled payouts; one definition in lib/admin/revenue.
  const [collected, payouts, refundedMinor] = await Promise.all([loadCollected(), loadPayoutTotals(), loadRefundedWithin()]);
  return {
    refundedMinor,
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
  const view: View = params.view === "payouts" ? "payouts" : params.source === "intern" ? "intern" : params.source === "college" ? "college" : "employer";

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
    table = view === "payouts" ? await PayoutsTable({ params }) : view === "intern" ? await InternFeesTable({ params }) : view === "college" ? await CollegeBatchesTable({ params }) : await EmployerPaymentsTable({ params });
  } catch (error) {
    console.error("[admin/transactions] list failed", error);
    table = <AdminLoadError what="the ledger" retryHref="/admin/transactions" />;
  }

  const tabs: { key: View; label: string; href: string }[] = [
    { key: "employer", label: "Employer payments", href: "/admin/transactions" },
    { key: "intern", label: "Intern fees", href: "/admin/transactions?source=intern" },
    { key: "college", label: "College seats", href: "/admin/transactions?source=college" },
    { key: "payouts", label: "Intern payouts", href: "/admin/transactions?view=payouts" },
  ];
  const net = metrics ? metrics.inflowMinor - metrics.refundedMinor : 0;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Transactions"
        subtitle="Money in from employers, interns and colleges, and money out to interns."
        action={
          <ButtonLink href="/admin/reports/money" variant="outline" size="sm">
            Money in and out
          </ButtonLink>
        }
      />

      {metrics ? (
        <Overview
          lead={
            <LeadStat
              label="Received, net of refunds"
              value={<RollingNumber value={Math.round(net / 100)} currency="INR" />}
              note={`${formatNumber(metrics.inflowCount)} paid receipts, ${formatMoney(metrics.inflowMinor, "INR", { zeroLabel: "₹0" })} before refunds. Dollar payments are counted at the business rate of ₹100 to $1.`}
            />
          }
          rest={
            <StatList
              items={[
                { label: "Paid out", value: formatMoney(metrics.outflowMinor, "INR", { zeroLabel: "₹0" }), hint: `${formatNumber(metrics.outflowPaid)} of ${formatNumber(metrics.outflowTotal)} payouts settled` },
                { label: "Payouts waiting for a bank reference", value: formatNumber(metrics.pendingPayouts), href: "/admin/transactions?view=payouts&status=pending" },
                ...(metrics.refundedMinor > 0 ? [{ label: "Refunded", value: formatMoney(metrics.refundedMinor, "INR", { zeroLabel: "₹0" }), href: "/admin/refunds" }] : []),
              ]}
            />
          }
        />
      ) : (
        <AdminLoadError what="the ledger totals" retryHref="/admin/transactions" />
      )}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section title="Revenue collected" hint="By month: paid employer orders, intern fees and college seat batches, in INR.">
          {charts ? <RevenueChart data={charts.revenue} /> : <ChartError />}
        </Section>
        <Section title="Payments, last 7 days" hint="Paid transactions per day, India time. Days with none are hatched.">
          {charts ? <VolumeBars data={charts.volume} /> : <ChartError />}
        </Section>
      </div>

      <section className="space-y-4">
        <FilterTabs label="Ledger view" value={view} hrefFor={(k) => tabs.find((t) => t.key === k)?.href ?? "/admin/transactions"} tabs={tabs.map((t) => ({ key: t.key, label: t.label }))} />
        {table}
      </section>
    </div>
  );
}

function ChartError() {
  return <p className="py-8 text-sm font-medium text-danger">This chart couldn&apos;t be loaded. The tables below are unaffected.</p>;
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
    { value: "created", label: "Unpaid" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ],
};

function order(params: Record<string, string>, amount: AnyColumn, created: AnyColumn) {
  const s = parseSort(params, ["date", "amount"] as const, { key: "date", dir: "desc" });
  const col = s.key === "amount" ? amount : created;
  return s.dir === "asc" ? asc(col) : desc(col);
}

/** Two lines: a name that links to its record and a quiet second line. */
function Who({ name, sub, href }: { name: string; sub?: string | null; href: string }) {
  return (
    <div className="min-w-0 max-w-72">
      <Link href={href} className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline">
        {name}
      </Link>
      {sub ? <span className="block truncate text-xs text-ink-600">{sub}</span> : null}
    </div>
  );
}

/** A figure in its own currency: rupees through Money, dollars through formatMoney. */
function Amt({ minor, currency, className }: { minor: number; currency: string; className?: string }) {
  return currency === "USD" ? <span className={className}>{money(minor, "USD")}</span> : <Money minor={minor} className={className} />;
}

const when = (row: { paidAt: Date | null; createdAt: Date | null }) => formatDate((row.paidAt ?? row.createdAt)?.toISOString() ?? null);
const ref = (v: string | null | undefined, fallback = "–") => (v ? <span className="nums break-all text-xs text-ink-600">{v}</span> : <span className="text-ink-600">{fallback}</span>);
const DATE_SORT = { sort: "date" } as const;

type Page = { page: number; pages: number; total: number; perPage: number };
const common = (params: Record<string, string>, p: Page) => ({ basePath: "/admin/transactions", params, page: p.page, pages: p.pages, total: p.total, perPage: p.perPage });

async function EmployerPaymentsTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const req = parsePageRequest(params);
  const conditions = [
    searchAny([sql`${schema.employers.companyName}`, sql`${schema.employers.companyEmail}`, sql`${schema.employerPayments.orderId}`, sql`coalesce(${schema.employerPayments.paymentId}, '')`, sql`coalesce(${schema.employerPayments.invoiceNumber}, '')`], req.search),
    params.status ? eq(schema.employerPayments.status, params.status) : undefined,
    params.currency ? eq(schema.employerPayments.currency, params.currency) : undefined,
    periodStart(params.period) ? gte(schema.employerPayments.createdAt, periodStart(params.period)!) : undefined,
    // The column shown as "Date" (paid, else created), as Orders filters it.
    ...dateRangeConditions(sql`coalesce(${schema.employerPayments.paidAt}, ${schema.employerPayments.createdAt})`, params),
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
        raw: schema.employerPayments.raw,
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
  // Money back beside the amount, as on Orders: the stored status stays "paid" (a refund is a contra record).
  const shown = rows.map((r) => ({ ...r, refundedMinor: orderRefunds(r).refundedMinor, needsReview: orderReview(r.raw).flagged }));
  type Row = (typeof shown)[number];
  const columns: RecordColumn<Row>[] = [
    { key: "who", header: "Company", primary: true, cell: (r) => <Who name={r.companyName} sub={r.companyEmail} href={`/admin/companies/${r.employerId}`} /> },
    {
      key: "amt",
      header: "Amount",
      align: "right",
      sort: "amount",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <Amt minor={r.amountMinor} currency={r.currency} className="font-semibold" />
          {r.refundedMinor > 0 ? <p className="text-xs text-ink-600">refunded <Amt minor={r.refundedMinor} currency={r.currency} /></p> : null}
        </div>
      ),
    },
    { key: "gw", header: "Gateway", cell: (r) => gatewayLabel(r.gateway) },
    { key: "order", header: "Order", cell: (r) => ref(r.orderId) },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusChip status={displayStatus(r)} />
          {r.needsReview ? <StatusChip status="needs_review" /> : null}
        </span>
      ),
    },
    { key: "date", header: "Date", align: "right", ...DATE_SORT, cell: (r) => <span className="whitespace-nowrap">{when(r)}</span> },
    { key: "age", header: "Open for", align: "right", hideOnCard: (r) => r.status !== "created", cell: (r) => (r.status === "created" ? <AgeCell from={r.createdAt} /> : <span className="text-ink-600">–</span>) },
  ];
  return (
    <RecordsLedger
      {...common(params, page)}
      rows={shown}
      rowKey={(r) => r.id}
      columns={columns}
      noun="employer payments"
      caption="Employer payments"
      searchPlaceholder="Search company, invoice, order or payment ID…"
      exportHref={exportHref("payments", params)}
      extra={<DateRangeForm params={params} />}
      filters={[STATUS_FILTER, { key: "currency", label: "Currency", options: [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }] }, { key: "period", label: "Period", options: PERIOD_OPTIONS }]}
      empty={{ title: "No employer payments yet", body: "A payment appears when an employer pays for a hire or for Findtern Pro.", next: { label: "See the proposal pipeline", href: "/admin/proposal-tracker" } }}
    />
  );
}

/** Paid and pending college seat batches: the college side of the ledger (money in). */
async function CollegeBatchesTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const req = parsePageRequest(params);
  const b = schema.collegeSeatBatches;
  const conditions = [
    searchAny([sql`${schema.colleges.name}`, sql`coalesce(${b.invoiceNumber}, '')`, sql`coalesce(${b.referenceId}, '')`], req.search),
    params.status ? eq(b.status, params.status) : undefined,
    periodStart(params.period) ? gte(b.createdAt, periodStart(params.period)!) : undefined,
    ...dateRangeConditions(b.createdAt, params),
  ].filter(Boolean) as SQL[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ id: b.id, collegeId: b.collegeId, college: schema.colleges.name, city: schema.colleges.city, seats: b.seats, amountMinor: b.amountMinor, status: b.status, invoiceNumber: b.invoiceNumber, referenceId: b.referenceId, paidAt: b.paidAt, createdAt: b.createdAt })
      .from(b)
      .innerJoin(schema.colleges, eq(schema.colleges.id, b.collegeId))
      .where(where)
      .orderBy(order(params, b.amountMinor, b.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(b).innerJoin(schema.colleges, eq(schema.colleges.id, b.collegeId)).where(where),
  ]);
  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  type Row = (typeof rows)[number];
  const columns: RecordColumn<Row>[] = [
    { key: "who", header: "College", primary: true, cell: (r) => <Who name={r.college} sub={r.city} href={`/admin/colleges/${r.collegeId}`} /> },
    { key: "seats", header: "Seats", align: "right", cell: (r) => r.seats.toLocaleString("en-IN") },
    { key: "amt", header: "Amount", align: "right", sort: "amount", cell: (r) => <Money minor={r.amountMinor} className="font-semibold" /> },
    { key: "inv", header: "Invoice", cell: (r) => ref(r.invoiceNumber) },
    { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
    { key: "date", header: "Date", align: "right", ...DATE_SORT, cell: (r) => <span className="whitespace-nowrap">{when(r)}</span> },
    { key: "age", header: "Open for", align: "right", hideOnCard: (r) => r.status !== "pending", cell: (r) => (r.status === "pending" ? <AgeCell from={r.createdAt} /> : <span className="text-ink-600">–</span>) },
  ];
  return (
    <RecordsLedger
      {...common(params, page)}
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      noun="college seat batches"
      caption="College seat batches"
      searchPlaceholder="Search college, invoice or reference…"
      exportHref={exportHref("payments", { ...params, source: "college" })}
      extra={<DateRangeForm params={params} />}
      filters={[{ key: "status", label: "Status", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "void", label: "Void" }] }, { key: "period", label: "Period", options: PERIOD_OPTIONS }]}
      empty={{ title: "No college seat batches yet", body: "A batch appears when a college buys seats for a drive.", next: { label: "Open drive overview", href: "/admin/drive-overview" } }}
    />
  );
}

async function InternFeesTable({ params }: { params: Record<string, string> }) {
  const db = getDb();
  const req = parsePageRequest(params);
  const conditions = [
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayments.orderId}`, sql`coalesce(${schema.internPayments.paymentId}, '')`, sql`coalesce(${schema.internPayments.invoiceNumber}, '')`], req.search),
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
  type Row = (typeof rows)[number];
  const columns: RecordColumn<Row>[] = [
    { key: "who", header: "Intern", primary: true, cell: (r) => <Who name={r.name.trim() || "Candidate"} sub={r.email} href={`/admin/interns/${r.internId}`} /> },
    { key: "amt", header: "Amount", align: "right", sort: "amount", cell: (r) => <Amt minor={r.amountMinor} currency={r.currency} className="font-semibold" /> },
    { key: "gw", header: "Gateway", cell: (r) => gatewayLabel(r.gateway) },
    { key: "order", header: "Order", cell: (r) => ref(r.orderId) },
    { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
    { key: "date", header: "Date", align: "right", ...DATE_SORT, cell: (r) => <span className="whitespace-nowrap">{when(r)}</span> },
    { key: "age", header: "Open for", align: "right", hideOnCard: (r) => r.status !== "created", cell: (r) => (r.status === "created" ? <AgeCell from={r.createdAt} /> : <span className="text-ink-600">–</span>) },
  ];
  return (
    <RecordsLedger
      {...common(params, page)}
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      noun="intern payments"
      caption="Intern activation payments"
      searchPlaceholder="Search intern, invoice, order or payment ID…"
      exportHref={exportHref("intern-payments", params)}
      extra={<DateRangeForm params={params} />}
      filters={[STATUS_FILTER, { key: "period", label: "Period", options: PERIOD_OPTIONS }]}
      empty={{ title: "No intern fees yet", body: "A fee appears when a candidate pays the activation fee.", next: { label: "Open candidates", href: "/admin/interns" } }}
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
        kind: schema.internPayouts.kind,
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
  type Row = (typeof rows)[number];
  const columns: RecordColumn<Row>[] = [
    { key: "who", header: "Intern", primary: true, cell: (r) => <Who name={r.name.trim() || "Candidate"} sub={r.company || r.email} href={`/admin/interns/${r.internId}`} /> },
    {
      key: "amt",
      header: "Amount",
      align: "right",
      sort: "amount",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <Amt minor={r.amountMinor} currency={r.currency} className="font-semibold" />
          <p className={r.kind === "completion_bonus" ? "text-xs font-medium text-ink-900" : "text-xs text-ink-600"}>{payoutKindLabel(r.kind)}</p>
        </div>
      ),
    },
    { key: "method", header: "Method", cell: (r) => (r.method ? r.method.toUpperCase() : <span className="text-ink-600">–</span>) },
    { key: "ref", header: "Bank reference", cell: (r) => ref(r.referenceId, "Not yet") },
    { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
    { key: "date", header: "Date", align: "right", ...DATE_SORT, cell: (r) => <span className="whitespace-nowrap">{r.paidAt ? `Paid ${formatDate(r.paidAt.toISOString())}` : formatDate(r.createdAt?.toISOString() ?? null)}</span> },
    { key: "age", header: "Waiting", align: "right", hideOnCard: (r) => r.status !== "pending", cell: (r) => (r.status === "pending" ? <AgeCell from={r.createdAt} /> : <span className="text-ink-600">–</span>) },
    ...(canPay ? [{ key: "act", header: "Record payment", actions: true, align: "right" as const, cell: (r: Row) => (r.status === "pending" ? <PayoutEditor payoutId={r.id} initialReference={r.referenceId} status={r.status} /> : <span className="text-ink-600">–</span>) }] : []),
  ];
  return (
    <RecordsLedger
      {...common(params, page)}
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      noun="payouts"
      caption="Intern payouts"
      searchPlaceholder="Search intern, company or bank reference…"
      exportHref={exportHref("payouts", params)}
      extra={<DateRangeForm params={params} />}
      filters={[{ key: "status", label: "Status", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "failed", label: "Failed" }] }]}
      empty={{ title: "No payouts yet", body: "Payouts are recorded from an intern's record or the Intern disbursements page.", next: { label: "Open disbursements", href: "/admin/payouts" } }}
    />
  );
}
