import { DataTable, IdentityCell, parseSort, type Column } from "@/components/admin/data-table";
import { InvoiceCsvButton, InvoiceRowActions } from "@/components/admin/invoice-actions";
import { DateRangeForm } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
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
import { ledgerTotals } from "@/lib/admin/revenue";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
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
  uncounted,
}: {
  kind: InvoiceKind;
  rows: AdminInvoiceRow[];
  seller: InvoiceSeller;
  params: Record<string, string>;
  basePath: string;
  /** Row ids that are listed but are not customers' money (test employers). */
  uncounted?: ReadonlySet<string>;
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
  // Collected, discounts and not-collected come from the one money layer
  // (lib/admin/revenue): paid payment rows only, so they reconcile with
  // Transactions, Reports and the Dashboard.
  const totals = ledgerTotals(filtered, uncounted);

  const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });
  const gstOf = (r: AdminInvoiceRow) => r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;
  const codes = promoCodeOptions(rows);

  // Five columns (it was twelve and ran 360px past 1440): the invoice number,
  // interns, GST, discount, promo and gateway ride as second lines.
  const columns: Column<AdminInvoiceRow>[] = [
    {
      header: k.party,
      sort: "party",
      cell: (r) => {
        const n = displayInvoiceNumber(r, k.invoicePrefix);
        return (
          <IdentityCell
            name={r.partyName}
            id={r.partyId}
            href={`${k.hrefBase}/${r.partyId}`}
            className="max-w-72"
            sub={
              <>
                <span className="block truncate">{kind === "employer" && r.interns ? r.interns.split("; ").join(", ") : r.partyEmail}</span>
                {n ? <span className="nums block truncate">{n}</span> : null}
              </>
            }
          />
        );
      },
    },
    {
      header: "Amount",
      align: "right",
      sort: "amount",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="nums font-semibold text-foreground">{money(r.amountMinor, r.currency)}</p>
          {r.amountMinor > 0 ? <p className="nums text-xs text-text-subtle">incl. GST {money(gstOf(r), r.currency)}</p> : null}
          {(r.discountMinor ?? 0) > 0 || r.promoCode ? (
            <p className="nums text-xs text-text-subtle">
              {r.promoCode ? <span className="font-semibold text-foreground">{r.promoCode}</span> : null}
              {(r.discountMinor ?? 0) > 0 ? ` − ${money(r.discountMinor ?? 0, r.currency)}` : r.promoCode ? " · discount not recorded" : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex flex-wrap items-center gap-1">
            <StatusBadge value={isPaidRow(r) ? "paid" : r.status} />
            {r.needsReview ? <StatusBadge tone="danger" label="Needs review" /> : null}
            {r.flagOnly ? <StatusBadge tone="neutral" label="Marked paid" /> : null}
          </span>
          {kind === "employer" ? <span className="text-xs text-text-subtle">{gatewayLabel(r.gateway)}</span> : null}
        </div>
      ),
    },
    {
      header: "Date",
      sort: "date",
      cell: (r) =>
        r.paidAt ? (
          <span className="nums whitespace-nowrap">Paid {formatDate(r.paidAt)}</span>
        ) : (
          <span className="nums whitespace-nowrap text-text-subtle">Created {formatDate(r.createdAt)}</span>
        ),
    },
    {
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (r) => <InvoiceRowActions row={r} kind={kind} seller={seller} />,
    },
  ];

  return (
    <div className="space-y-[var(--admin-gap)] lg:space-y-6">
      <StatGrid cols={3}>
        <StatCard
          featured
          label="Collected"
          value={formatMoney(totals.collectedMinor, "INR", { zeroLabel: "₹0" })}
          hint={`${formatNumber(totals.collectedCount)} paid ${k.noun} · USD at ₹100/$${totals.markedPaidCount ? ` · ${formatNumber(totals.markedPaidCount)} marked paid elsewhere, not counted` : ""}`}
          tone="neutral"
        />
        <StatCard
          label="Discounts given"
          value={formatMoney(totals.discountMinor, "INR", { zeroLabel: "₹0" })}
          hint="Promo codes and legacy discounts on paid rows"
          tone="neutral"
        />
        <StatCard
          label="Not collected"
          value={formatMoney(totals.notCollectedMinor, "INR", { zeroLabel: "₹0" })}
          hint={`${formatNumber(totals.notCollectedCount)} unpaid, failed or abandoned`}
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
        searchPlaceholder={kind === "employer" ? "Search company, intern, invoice or order…" : "Search intern, email, invoice or order…"}
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
