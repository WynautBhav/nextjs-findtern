import Link from "next/link";
import { CircleDollarSign, Hourglass, Receipt } from "lucide-react";

import { DataTable, parseSort, type Column } from "@/components/admin/data-table";
import { InvoiceCsvButton, InvoiceRowActions } from "@/components/admin/invoice-actions";
import { DateRangeForm } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { toInrMinor } from "@/lib/admin/money";
import {
  displayInvoiceNumber,
  filterInvoiceRows,
  gatewayLabel,
  INVOICE_KINDS,
  invoiceFilters,
  isPaidRow,
  promoCodeOptions,
  sortInvoiceRows,
  type AdminInvoiceRow,
  type InvoiceKind,
  type InvoiceSort,
} from "@/lib/admin/invoice-rows";
import { parsePageRequest } from "@/lib/admin/params";
import { formatDate, formatMoney } from "@/lib/format";
import { placeOfSupply, splitGst } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";

export type { AdminInvoiceRow };

/**
 * Employer orders and intern activation fees: one ledger component.
 *
 * Filters live in the URL (search, status, currency, promo, code, dates,
 * sort, page), so a filtered view can be shared and the pager is real. The
 * rows are few hundred at most, so they are filtered in memory on the server
 * from the full set the page loaded; the CSV button exports every row the
 * filters keep, not just the visible page.
 */
export function AdminInvoicesView({
  kind,
  rows,
  seller,
  params,
  basePath,
}: {
  kind: InvoiceKind;
  rows: AdminInvoiceRow[];
  seller: InvoiceSeller;
  params: Record<string, string>;
  basePath: string;
}) {
  const k = INVOICE_KINDS[kind];
  const req = parsePageRequest(params);
  const sort = parseSort<InvoiceSort>(params, ["date", "amount", "party"], { key: "date", dir: "desc" });
  const filtered = sortInvoiceRows(filterInvoiceRows(rows, invoiceFilters(params), k.invoicePrefix), sort.key, sort.dir);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = filtered.slice((page - 1) * req.perPage, page * req.perPage);

  // One currency: USD converted at ₹100/$. Over the filtered rows, so the
  // tiles agree with the table under them.
  const paid = filtered.filter(isPaidRow);
  const paidMinor = paid.reduce((s, r) => s + toInrMinor(r.amountMinor, r.currency), 0);
  const pendingMinor = filtered.filter((r) => !isPaidRow(r)).reduce((s, r) => s + toInrMinor(r.amountMinor, r.currency), 0);
  const discountMinor = paid.reduce((s, r) => s + toInrMinor(r.discountMinor ?? 0, r.currency), 0);

  const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });
  const gstOf = (r: AdminInvoiceRow) => r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;
  const codes = promoCodeOptions(rows);

  const columns: Column<AdminInvoiceRow>[] = [
    {
      header: "Invoice no.",
      cell: (r) => {
        const n = displayInvoiceNumber(r, k.invoicePrefix);
        return n ? <span className="font-mono text-xs text-ink-800">{n}</span> : <span className="text-text-subtle">-</span>;
      },
    },
    {
      header: k.party,
      sort: "party",
      cell: (r) => (
        <div className="min-w-0 max-w-56">
          <Link href={`${k.hrefBase}/${r.partyId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline" title={r.partyName}>
            {r.partyName}
          </Link>
          <p className="truncate text-xs text-ink-600" title={r.partyEmail}>
            {r.partyEmail}
          </p>
        </div>
      ),
    },
    ...(kind === "employer"
      ? [
          {
            header: "Interns",
            cell: (r: AdminInvoiceRow) =>
              r.interns ? (
                <span className="block max-w-48 truncate" title={r.interns.split("; ").join(", ")}>
                  {r.interns.split("; ").join(", ")}
                </span>
              ) : (
                <span className="text-text-subtle">-</span>
              ),
          },
        ]
      : []),
    { header: "Amount", align: "right", sort: "amount", cell: (r) => <span className="font-semibold text-ink-900">{money(r.amountMinor, r.currency)}</span> },
    { header: "GST", align: "right", cell: (r) => (r.amountMinor > 0 ? money(gstOf(r), r.currency) : <span className="text-text-subtle">-</span>) },
    {
      header: "Discount",
      align: "right",
      cell: (r) =>
        (r.discountMinor ?? 0) > 0 ? (
          <span className="text-ink-800">− {money(r.discountMinor ?? 0, r.currency)}</span>
        ) : r.promoCode ? (
          <span className="text-ink-600">Not recorded</span>
        ) : (
          <span className="text-text-subtle">-</span>
        ),
    },
    {
      header: "Promo code",
      cell: (r) => (r.promoCode ? <span className="font-mono text-xs font-semibold text-ink-800">{r.promoCode}</span> : <span className="text-text-subtle">-</span>),
    },
    {
      header: "Status",
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge value={isPaidRow(r) ? "paid" : r.status} />
          {r.needsReview ? <StatusBadge tone="danger" label="Needs review" /> : null}
          {r.flagOnly ? <StatusBadge tone="neutral" label="Marked paid" /> : null}
        </span>
      ),
    },
    ...(kind === "employer" ? [{ header: "Gateway", cell: (r: AdminInvoiceRow) => gatewayLabel(r.gateway) }] : []),
    { header: "Paid on", sort: "date", align: "right", cell: (r) => (r.paidAt ? formatDate(r.paidAt) : <span className="text-text-subtle">-</span>) },
    { header: "Created", align: "right", cell: (r) => <span className="text-ink-600">{formatDate(r.createdAt)}</span> },
    {
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (r) => <InvoiceRowActions row={r} kind={kind} seller={seller} />,
    },
  ];

  return (
    <div className="space-y-6">
      <StatGrid cols={3}>
        <StatCard
          label="Collected"
          value={formatMoney(paidMinor, "INR", { zeroLabel: "₹0" })}
          hint={`${paid.length.toLocaleString("en-IN")} paid ${k.noun} · USD at ₹100/$`}
          icon={CircleDollarSign}
          tone="neutral"
        />
        <StatCard
          label="Discounts given"
          value={formatMoney(discountMinor, "INR", { zeroLabel: "₹0" })}
          hint="Promo codes and legacy discounts on paid rows"
          icon={Receipt}
          tone="neutral"
        />
        <StatCard
          label="Not collected"
          value={formatMoney(pendingMinor, "INR", { zeroLabel: "₹0" })}
          hint={`${(filtered.length - paid.length).toLocaleString("en-IN")} unpaid, failed or abandoned`}
          icon={Hourglass}
          tone="neutral"
        />
      </StatGrid>

      <DataTable
        basePath={basePath}
        params={params}
        page={page}
        pages={pages}
        total={total}
        perPage={req.perPage}
        rows={shown}
        columns={columns}
        noun={k.noun}
        caption={kind === "employer" ? "Employer orders" : "Intern activation payments"}
        searchPlaceholder={kind === "employer" ? "Search company, intern, invoice, order or payment ID…" : "Search intern, email, invoice, order or code…"}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "created", label: "Pending" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          ...(kind === "employer" ? [{ key: "currency", label: "Currency", options: [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }] }] : []),
          { key: "promo", label: "Promo", options: [{ value: "with", label: "Promo applied" }, { value: "without", label: "No promo" }] },
          ...(codes.length ? [{ key: "code", label: "Code", options: codes.map((c) => ({ value: c, label: c })) }] : []),
        ]}
        extraControls={
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeForm params={params} />
            <InvoiceCsvButton rows={filtered} kind={kind} />
          </div>
        }
        empty={{
          title: rows.length ? "Nothing matches these filters" : `No ${k.noun} yet`,
          body: rows.length
            ? "Clear a filter or widen the dates to see more."
            : kind === "employer"
              ? "Orders appear here when an employer starts checkout."
              : "Activation payments appear here when an intern pays the fee.",
          action: rows.length ? { href: basePath, label: "Clear filters" } : undefined,
        }}
      />
    </div>
  );
}
