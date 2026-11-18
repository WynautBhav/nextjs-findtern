import Link from "next/link";

import { Overview, LeadStat, StatList } from "@/components/app/stat";
import { RollingNumber } from "@/components/app/rolling-number";
import { InvoiceCsvButton, InvoiceRowActions } from "@/components/admin/invoice-actions";
import { DateRangeForm } from "@/components/admin/report-range";
import { parseSort } from "@/components/admin/data-table";
import { AgeCell, Money } from "@/components/admin/money/ledger";
import { RecordsLedger, type RecordColumn } from "@/components/admin/money/records-ledger";
import { StatusChip } from "@/components/admin/money/status-chip";
import {
  displayInvoiceNumber,
  displayStatus,
  filterInvoiceRows,
  gatewayLabel,
  INVOICE_KINDS,
  isWaivedRow,
  invoiceFilters,
  promoCodeOptions,
  sortInvoiceRows,
  type AdminInvoiceRow,
  type InvoiceSort,
} from "@/lib/admin/invoice-rows";
import { parsePageRequest } from "@/lib/admin/params";
import { ledgerTotals } from "@/lib/admin/revenue";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { placeOfSupply, splitGst } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";

/** A figure in the row's own currency: rupees through `Money`, anything else through formatMoney. */
function Amount({ minor, currency, className }: { minor: number; currency: string; className?: string }) {
  return currency === "USD" ? <span className={className}>{formatMoney(minor, "USD", { zeroLabel: false })}</span> : <Money minor={minor} className={className} />;
}

/**
 * Employer orders as a ledger. Lead figure: money in net of refunds. Unpaid orders carry an age so a checkout
 * that was abandoned a fortnight ago reads differently from one started this morning. Filters, sort and page are
 * URL params; the CSV is every row the filters keep.
 */
export function OrdersView({ rows, seller, params, basePath, uncounted }: { rows: AdminInvoiceRow[]; seller: InvoiceSeller; params: Record<string, string>; basePath: string; uncounted?: ReadonlySet<string> }) {
  const k = INVOICE_KINDS.employer;
  const req = parsePageRequest(params);
  const sort = parseSort<InvoiceSort>(params, ["date", "amount", "party"], { key: "date", dir: "desc" });
  const filtered = sortInvoiceRows(filterInvoiceRows(rows, invoiceFilters(params), k.invoicePrefix), sort.key, sort.dir);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = filtered.slice((page - 1) * req.perPage, page * req.perPage);
  const totals = ledgerTotals(filtered, uncounted);
  const codes = promoCodeOptions(rows);
  const gstOf = (r: AdminInvoiceRow) => r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;
  const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
  const reviewCount = filtered.filter((r) => r.needsReview).length;

  const columns: RecordColumn<AdminInvoiceRow>[] = [
    {
      key: "party",
      header: k.party,
      sort: "party",
      primary: true,
      cell: (r) => {
        const n = displayInvoiceNumber(r, k.invoicePrefix);
        return (
          <div className="min-w-0 max-w-72">
            <Link href={`${k.hrefBase}/${r.partyId}`} className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline">
              {r.partyName}
            </Link>
            <span className="nums block truncate text-xs text-ink-600">{n ?? r.orderId}</span>
            {r.interns ? <span className="block truncate text-xs text-ink-600" title={r.interns}>For {r.interns.split("; ").join(", ")}</span> : null}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: "amount",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <Amount minor={r.amountMinor} currency={r.currency} className="font-semibold" />
          {r.amountMinor > 0 && r.currency !== "USD" ? <p className="text-xs text-ink-600">incl. GST <Amount minor={gstOf(r)} currency={r.currency} /></p> : null}
          {(r.refundedMinor ?? 0) > 0 ? <p className="text-xs text-ink-600">refunded <Amount minor={r.refundedMinor ?? 0} currency={r.currency} /></p> : null}
          {r.promoCode || (r.discountMinor ?? 0) > 0 ? (
            <p className="text-xs text-ink-600">
              {r.promoCode ? <span className="font-medium text-ink-900">{r.promoCode}</span> : null}
              {(r.discountMinor ?? 0) > 0 ? <> − <Amount minor={r.discountMinor ?? 0} currency={r.currency} /></> : r.promoCode ? " (discount not recorded)" : null}
            </p>
          ) : null}
          {isWaivedRow(r) ? <p className="text-xs text-ink-600">list value waived <Amount minor={r.waivedMinor ?? 0} currency={r.currency} /></p> : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex flex-wrap items-center gap-1">
            <StatusChip status={displayStatus(r)} />
            {isWaivedRow(r) ? <StatusChip status="paid" label="Complimentary" /> : null}
            {uncounted?.has(r.id) ? <StatusChip status="test" label="Test employer" tone="neutral" /> : null}
            {r.needsReview ? (
              <span title={r.reviewReasons?.join(". ")}>
                <StatusChip status="needs_review" />
              </span>
            ) : null}
          </span>
          {!isWaivedRow(r) && r.gateway !== "razorpay" ? <span className="text-xs text-ink-600">{gatewayLabel(r.gateway)}</span> : null}
          {r.needsReview && r.reviewReasons?.[0] ? <span className="max-w-64 text-xs text-ink-700">{r.reviewReasons[0]}</span> : null}
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      sort: "date",
      cell: (r) => (r.paidAt ? <span className="whitespace-nowrap">Paid {formatDate(r.paidAt)}</span> : <span className="whitespace-nowrap text-ink-700">Started {formatDate(r.createdAt)}</span>),
    },
    {
      key: "age",
      header: "Open for",
      align: "right",
      hideOnCard: (r) => r.status !== "created",
      cell: (r) => (r.status === "created" ? <AgeCell from={r.createdAt} /> : <span className="text-ink-600">–</span>),
    },
    { key: "actions", header: "Invoice", actions: true, align: "right", cell: (r) => <div className="flex justify-end"><InvoiceRowActions row={r} kind="employer" seller={seller} /></div> },
  ];

  const net = totals.netCollectedMinor;
  return (
    <div className="space-y-8">
      <Overview
        lead={
          <LeadStat
            label="Collected, net of refunds"
            value={<RollingNumber value={Math.round(net / 100)} currency="INR" />}
            note={`${formatNumber(totals.collectedCount)} paid ${totals.collectedCount === 1 ? "order" : "orders"}${filtered.length !== rows.length ? " in this view" : ""}. Dollar orders are counted at the business rate of ₹100 to $1.${totals.markedPaidCount ? ` ${formatNumber(totals.markedPaidCount)} marked paid elsewhere are not counted.` : ""}`}
            action={reviewCount > 0 ? { label: `${reviewCount} ${reviewCount === 1 ? "order needs" : "orders need"} review`, href: `${basePath}?status=review` } : undefined}
          />
        }
        rest={
          <StatList
            items={[
              ...(totals.refundedMinor > 0 ? [{ label: "Refunded", value: inr(totals.refundedMinor), hint: `Gross collected ${inr(totals.collectedMinor)}` }] : []),
              { label: "Not collected", value: inr(totals.notCollectedMinor), hint: `${formatNumber(totals.notCollectedCount)} unpaid, failed or abandoned` },
              { label: "Discounts given", value: inr(totals.discountMinor), hint: "Promo codes on paid orders" },
              ...(totals.waivedCount ? [{ label: "Waived", value: inr(totals.waivedMinor ?? 0), hint: `${formatNumber(totals.waivedCount)} complimentary, not money received` }] : []),
            ]}
          />
        }
      />
      <RecordsLedger
        basePath={basePath}
        params={params}
        page={page}
        pages={pages}
        total={total}
        perPage={req.perPage}
        rows={shown}
        rowKey={(r) => r.id}
        columns={columns}
        caption="Employer orders"
        noun="orders"
        searchPlaceholder="Search company, invoice or order"
        exportHref={undefined}
        extra={
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeForm params={params} />
            <InvoiceCsvButton rows={filtered} kind="employer" />
          </div>
        }
        filters={[
          { key: "status", label: "Status", options: [{ value: "paid", label: "Paid" }, { value: "created", label: "Unpaid" }, { value: "failed", label: "Failed" }, { value: "cancelled", label: "Cancelled" }, { value: "refunded", label: "Has a refund" }, { value: "review", label: "Needs review" }] },
          { key: "currency", label: "Currency", options: [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }] },
          { key: "promo", label: "Promo", options: [{ value: "with", label: "Promo applied" }, { value: "without", label: "No promo" }] },
          ...(codes.length ? [{ key: "code", label: "Code", options: codes.map((c) => ({ value: c, label: c })) }] : []),
        ]}
        empty={
          rows.length
            ? { title: "Nothing in this date range", body: "No order falls in the dates you picked.", next: { label: "Clear the dates", href: basePath } }
            : { title: "No orders yet", body: "An order appears here when an employer starts checkout. Until then there is nothing to chase.", next: { label: "See the proposal pipeline", href: "/admin/proposal-tracker" } }
        }
      />
    </div>
  );
}
