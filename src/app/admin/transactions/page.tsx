import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { getDb, schema } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

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
    db
      .select({
        totalAmount: sql<number>`coalesce(sum(${schema.employerPayments.amountMinor}), 0)::bigint`,
        paidCount: sql<number>`coalesce(count(case when ${schema.employerPayments.status} = 'paid' then 1 end), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(schema.employerPayments),
    db
      .select({
        totalAmount: sql<number>`coalesce(sum(${schema.internPayouts.amountMinor}), 0)::bigint`,
        paidCount: sql<number>`coalesce(count(case when ${schema.internPayouts.status} = 'completed' then 1 end), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(schema.internPayouts),
    db
      .select({ c: count() })
      .from(schema.internPayouts)
      .where(eq(schema.internPayouts.status, "pending")),
  ]);

  const num = (n: number) => n.toLocaleString("en-IN");

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
          title="Transactions"
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
            hint={`${num(paymentMetrics?.paidCount ?? 0)} employer receipts`}
            icon={ArrowDownLeft}
            tone="brand"
          />
          <StatCard
            label="Outflow payouts"
            value={formatMoney(Number(payoutMetrics?.totalAmount ?? 0), "INR", { compact: true })}
            hint={`${num(payoutMetrics?.totalCount ?? 0)} disbursement records`}
            icon={ArrowUpRight}
            tone="info"
          />
          <StatCard
            label="Pending payouts"
            value={num(Number(pendingPayoutsCount?.c ?? 0))}
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

        <div className="flex border-b border-ink-200">
          <Link
            href="/admin/transactions"
            className="border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            Employer payments
          </Link>
          <Link
            href="/admin/transactions?view=payouts"
            className="border-b-2 border-brand-700 px-4 py-2.5 text-sm font-semibold text-brand-800"
          >
            Intern disbursements
          </Link>
        </div>

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
                { value: "completed", label: "Completed" },
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
          ]}
        />
      </div>
    );
  }

  // Default: Employer Payments View
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
      .orderBy(desc(schema.employerPayments.createdAt))
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
        title="Transactions"
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
          hint={`${num(paymentMetrics?.paidCount ?? 0)} employer receipts`}
          icon={ArrowDownLeft}
          tone="brand"
        />
        <StatCard
          label="Outflow payouts"
          value={formatMoney(Number(payoutMetrics?.totalAmount ?? 0), "INR", { compact: true })}
          hint={`${num(payoutMetrics?.totalCount ?? 0)} disbursement records`}
          icon={ArrowUpRight}
          tone="info"
        />
        <StatCard
          label="Pending payouts"
          value={num(Number(pendingPayoutsCount?.c ?? 0))}
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

      <div className="flex border-b border-ink-200">
        <Link
          href="/admin/transactions"
          className="border-b-2 border-brand-700 px-4 py-2.5 text-sm font-semibold text-brand-800"
        >
          Employer payments
        </Link>
        <Link
          href="/admin/transactions?view=payouts"
          className="border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
        >
          Intern disbursements
        </Link>
      </div>

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
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "created", label: "Created" },
              { value: "failed", label: "Failed" },
            ],
          },
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
