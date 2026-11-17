import Link from "next/link";

import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";
import { canWrite } from "@/lib/admin/permissions";
import { flattenParams, parsePageRequest, toQueryString, type RawSearchParams } from "@/lib/admin/params";
import { getSession } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { filterCounts, filterSubscriptionRows, parseStatusFilter, SOURCE_LABELS, STATUS_FILTER_LABELS, STATUS_FILTERS, type SubscriptionRow } from "@/lib/subscription/admin-list";
import { loadSubscriptionRows } from "@/lib/subscription/admin-list-load";
import { GrantAccessButton, RowActions, SubscriptionNotice } from "./subscription-actions";

export const metadata = { title: "Subscriptions · Admin" };
export const dynamic = "force-dynamic";

const TONE: Record<SubscriptionRow["status"], StatusTone> = { active: "success", expiring: "warning", expired: "neutral", revoked: "danger", none: "neutral" };

function statusLabel(r: SubscriptionRow): string {
  if (r.status === "expiring") return r.daysLeft === 1 ? "Expiring in 1 day" : `Expiring in ${r.daysLeft ?? 0} days`;
  return r.status === "none" ? "None" : r.status[0].toUpperCase() + r.status.slice(1);
}

/** Findtern Pro employer subscriptions: who has it, until when, how they got it. Grant and revoke here; the price is in Pricing and fees. */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const status = parseStatusFilter(params.status);
  const req = parsePageRequest(params);
  const mayWrite = canWrite((await getSession())?.permissions, "/api/admin/subscriptions");

  let loaded: Awaited<ReturnType<typeof loadSubscriptionRows>> | null = null;
  try {
    loaded = await loadSubscriptionRows();
  } catch (error) {
    console.error("[admin/subscriptions] load failed", error);
  }

  const header = (
    <AdminPageHeader
      title="Subscriptions"
      subtitle="Companies on Findtern Pro: who is active, who is about to end, and who has lapsed. Grant or revoke access here; the price and length are under Pricing and fees."
      action={mayWrite ? <GrantAccessButton /> : undefined}
    />
  );
  if (!loaded) {
    return (
      <div>
        {header}
        <Panel>
          <AdminLoadError what="the subscriptions list" retryHref="/admin/subscriptions" />
        </Panel>
      </div>
    );
  }

  const counts = filterCounts(loaded.rows);
  const filtered = filterSubscriptionRows(loaded.rows, { status, q: req.search });
  const pages = Math.max(1, Math.ceil(filtered.length / req.perPage));
  const current = Math.min(req.page, pages);
  const shown = filtered.slice((current - 1) * req.perPage, current * req.perPage);
  const tabHref = (s: string) => `/admin/subscriptions${toQueryString({ ...(s === "all" ? {} : { status: s }), q: req.search })}`;
  const csvHref = `/api/admin/subscriptions${toQueryString({ format: "csv", status: status === "all" ? "" : status, q: req.search })}`;

  const columns: Column<SubscriptionRow>[] = [
    { header: "Company", cell: (r) => <IdentityCell name={r.company} id={r.employerId} sub={r.email} href={`/admin/companies/${encodeURIComponent(r.employerId)}`} /> },
    { header: "Plan", cell: () => "Findtern Pro", className: "whitespace-nowrap" },
    { header: "Status", cell: (r) => <StatusBadge tone={TONE[r.status]} label={statusLabel(r)} /> },
    { header: "Started", cell: (r) => <span className="whitespace-nowrap">{r.startedAt ? formatDate(r.startedAt) : "-"}</span> },
    { header: "Ends", cell: (r) => <span className="whitespace-nowrap">{r.endsAt ? formatDate(r.endsAt) : "-"}</span> },
    {
      header: "Source",
      cell: (r) => (
        <div>
          <span className="whitespace-nowrap">{r.source ? SOURCE_LABELS[r.source] : "-"}</span>
          {r.note ? (
            <span className="block max-w-56 truncate text-[0.8125rem] text-text-subtle" title={r.note}>
              {r.note}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Amount",
      numeric: true,
      cell: (r) => (r.source === "promo" ? <span className="text-text-subtle">Waived</span> : r.amountMinor === null ? "-" : formatMoney(r.amountMinor, r.currency ?? "INR", { zeroLabel: false })),
    },
    {
      header: "Order",
      cell: (r) =>
        r.orderRef ? (
          <Link
            href={`/admin/orders?q=${encodeURIComponent(r.orderRef)}`}
            className="inline-flex min-h-11 items-center break-all rounded-sm font-mono text-xs text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {r.orderRef.length > 18 ? `${r.orderRef.slice(0, 16)}…` : r.orderRef}
          </Link>
        ) : (
          "-"
        ),
    },
    ...(mayWrite
      ? [
          {
            header: <span className="sr-only">Actions</span>,
            label: "Actions",
            cell: (r: SubscriptionRow) => <RowActions company={{ id: r.employerId, name: r.company }} canRevoke={r.active} grantLabel={r.active ? "Extend" : "Grant"} />,
            className: "text-right",
          } satisfies Column<SubscriptionRow>,
        ]
      : []),
  ];

  return (
    <div>
      {header}
      {!loaded.enabled ? (
        <p role="status" className="mb-4 rounded-apple-sm bg-accent-100 px-4 py-3 text-sm text-accent-700">
          Findtern Pro is switched off in Pricing and fees: employers cannot buy it and nobody has access. The list below shows what each company holds for when it is switched on.
        </p>
      ) : null}
      <SubscriptionNotice />
      <section className="space-y-4">
        <AdminTabs
          label="Subscription status"
          active={status}
          items={STATUS_FILTERS.map((s) => ({ key: s, label: STATUS_FILTER_LABELS[s], count: counts[s], href: tabHref(s) }))}
        />
        <DataTable<SubscriptionRow>
          basePath="/admin/subscriptions"
          params={params}
          page={current}
          pages={pages}
          total={filtered.length}
          perPage={req.perPage}
          columns={columns}
          rows={shown}
          rowKey={(r) => r.employerId}
          noun="subscriptions"
          caption="Findtern Pro subscriptions"
          searchPlaceholder="Search company or email"
          exportHref={csvHref}
          empty={{
            title: loaded.rows.length === 0 ? "No subscriptions yet" : "Nothing in this view",
            body: loaded.rows.length === 0 ? "When a company buys Findtern Pro, or you grant it access, it shows up here." : "No company is in this status right now. Pick another tab above.",
          }}
        />
      </section>
    </div>
  );
}
