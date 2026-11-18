import Link from "next/link";

import { AdminLoadError } from "@/components/admin/panel";
import { Money } from "@/components/admin/money/ledger";
import { RecordsLedger, type RecordColumn } from "@/components/admin/money/records-ledger";
import { StatusChip } from "@/components/admin/money/status-chip";
import { FilterTabs } from "@/components/app/primitives";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { RollingNumber } from "@/components/app/rolling-number";
import { PageHeader } from "@/components/layout/page-header";
import { canWrite } from "@/lib/admin/permissions";
import { flattenParams, parsePageRequest, toQueryString, type RawSearchParams } from "@/lib/admin/params";
import { getSession } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { filterCounts, filterSubscriptionRows, parseStatusFilter, SOURCE_LABELS, STATUS_FILTER_LABELS, STATUS_FILTERS, type SubscriptionRow } from "@/lib/subscription/admin-list";
import { loadSubscriptionRows } from "@/lib/subscription/admin-list-load";
import { GrantAccessButton, RowActions, SubscriptionNotice } from "./subscription-actions";

export const metadata = { title: "Subscriptions · Admin" };
export const dynamic = "force-dynamic";

const statusLabel = (r: SubscriptionRow) => (r.status === "expiring" ? (r.daysLeft === 1 ? "Ends in 1 day" : `Ends in ${r.daysLeft ?? 0} days`) : undefined);

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
    <PageHeader
      title="Subscriptions"
      subtitle="Companies on Findtern Pro: who is active, who is about to end, and who has lapsed. Grant or revoke access here; the price and length are under Pricing and fees."
      action={mayWrite ? <GrantAccessButton /> : undefined}
    />
  );
  if (!loaded) {
    return (
      <div className="space-y-8">
        {header}
        <AdminLoadError what="the subscriptions list" retryHref="/admin/subscriptions" />
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
  const soonest = loaded.rows.filter((r) => r.status === "expiring").sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];

  const columns: RecordColumn<SubscriptionRow>[] = [
    {
      key: "company",
      header: "Company",
      primary: true,
      cell: (r) => (
        <div className="min-w-0 max-w-72">
          <Link href={`/admin/companies/${encodeURIComponent(r.employerId)}`} className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline">
            {r.company}
          </Link>
          {r.email ? <span className="block truncate text-xs text-ink-600">{r.email}</span> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} label={statusLabel(r)} /> },
    { key: "start", header: "Started", cell: (r) => <span className="whitespace-nowrap">{r.startedAt ? formatDate(r.startedAt) : "–"}</span> },
    {
      key: "ends",
      header: "Ends",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <span>{r.endsAt ? formatDate(r.endsAt) : "–"}</span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      cell: (r) => (
        <div>
          <span className="whitespace-nowrap">{r.source ? SOURCE_LABELS[r.source] : "–"}</span>
          {r.note ? (
            <span className="block max-w-48 truncate text-xs text-ink-600" title={r.note}>
              {r.note}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => (
        <div className="flex flex-col items-end">
          {r.source === "promo" ? (
            <span className="text-ink-700">Waived</span>
          ) : r.amountMinor === null ? (
            <span className="text-ink-600">–</span>
          ) : r.currency && r.currency !== "INR" ? (
            <span>{formatMoney(r.amountMinor, r.currency, { zeroLabel: false })}</span>
          ) : (
            <Money minor={r.amountMinor} />
          )}
          {r.orderRef ? (
            <Link href={`/admin/orders?q=${encodeURIComponent(r.orderRef)}`} title={`Open order ${r.orderRef}`} className="inline-flex min-h-8 items-center text-xs text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              View order
            </Link>
          ) : null}
        </div>
      ),
    },
    ...(mayWrite
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right" as const,
            actions: true,
            cell: (r: SubscriptionRow) => <RowActions company={{ id: r.employerId, name: r.company }} canRevoke={r.active} grantLabel={r.active ? "Extend" : "Grant"} />,
          } satisfies RecordColumn<SubscriptionRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      {header}
      {!loaded.enabled ? (
        <p role="status" className="border-y border-ink-200 py-3 text-sm text-ink-700">
          Findtern Pro is switched off in Pricing and fees: employers cannot buy it and nobody has access. The list shows what each company holds for when it is switched on.
        </p>
      ) : null}
      <SubscriptionNotice />
      <Overview
        lead={
          <LeadStat
            label="Companies with Pro access"
            value={<RollingNumber value={counts.active} />}
            note={soonest ? `${soonest.company} ends ${soonest.daysLeft === 1 ? "tomorrow" : `in ${soonest.daysLeft ?? 0} days`}.` : counts.active > 0 ? "None ends in the next few days." : "No company has access right now."}
            action={counts.expiring > 0 ? { label: `${counts.expiring} ending soon`, href: tabHref("expiring") } : undefined}
          />
        }
        rest={
          <StatList
            items={[
              ...(counts.expiring > 0 ? [{ label: "Of these, ending within 30 days", value: counts.expiring, href: tabHref("expiring") }] : []),
              { label: "Expired", value: counts.expired, hint: counts.expired > 0 ? "Lapsed; they can renew or you can extend" : undefined, href: counts.expired > 0 ? tabHref("expired") : undefined },
              { label: "Revoked", value: counts.revoked },
            ]}
          />
        }
      />
      <section className="space-y-4">
        <FilterTabs label="Subscription status" value={status} hrefFor={tabHref} tabs={STATUS_FILTERS.map((s) => ({ key: s, label: STATUS_FILTER_LABELS[s], count: counts[s] }))} />
        <RecordsLedger
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
          caption="Findtern Pro subscriptions (one plan)"
          searchPlaceholder="Search company"
          exportHref={csvHref}
          empty={
            loaded.rows.length === 0
              ? { title: "No subscriptions yet", body: "When a company buys Findtern Pro, or you grant it access, it shows up here.", next: mayWrite ? { label: "Open Pricing and fees", href: "/admin/settings" } : { label: "Open companies", href: "/admin/companies" } }
              : { title: "Nothing in this view", body: "No company is in this status right now.", next: { label: "Show every subscription", href: "/admin/subscriptions" } }
          }
        />
      </section>
    </div>
  );
}
