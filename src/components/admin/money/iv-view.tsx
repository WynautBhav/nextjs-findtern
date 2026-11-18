import Link from "next/link";

import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList, type StatItem } from "@/components/app/stat";
import { buttonClass } from "@/components/ui/button";
import { InvoiceFilterBar, InvoicePager } from "@/components/admin/money/iv-filters";
import { InternInvoiceLedger } from "@/components/admin/money/iv-ledger";
import { filterInvoiceRows, INVOICE_KINDS, invoiceFilters, promoCodeOptions, sortInvoiceRows, type AdminInvoiceRow } from "@/lib/admin/invoice-rows";
import { internInvoiceSummary, INVOICE_ORDERS, invoiceOrder } from "@/lib/admin/invoice-summary";
import { parsePageRequest } from "@/lib/admin/params";
import { formatMoney, formatNumber } from "@/lib/format";
import type { InvoiceSeller } from "@/lib/invoice";

const rupees = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });

/**
 * Intern activation fees: the lead figure (fees collected, and how many invoices that is), the quiet list of the rest,
 * then the ruled ledger with its filters. Filters live in the URL. The figures and the CSV cover every row the filters
 * keep, not just the visible page.
 */
export function InternInvoicesView({ rows, seller, params, basePath }: { rows: AdminInvoiceRow[]; seller: InvoiceSeller; params: Record<string, string>; basePath: string }) {
  const k = INVOICE_KINDS.intern;
  const req = parsePageRequest(params);
  const filters = invoiceFilters(params);
  const order = invoiceOrder(params);
  const { key, dir } = INVOICE_ORDERS[order];
  const filtered = sortInvoiceRows(filterInvoiceRows(rows, filters, k.invoicePrefix), key, dir);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = filtered.slice((page - 1) * req.perPage, page * req.perPage);
  const active = Boolean(filters.q || filters.status || filters.promo || filters.code || filters.from || filters.to);

  if (rows.length === 0) {
    return (
      <div className="border-t-2 border-ink-800 py-8">
        <p className="font-display text-xl font-semibold text-ink-900">No activation fees yet</p>
        <p className="mt-2 max-w-lg text-pretty text-sm leading-relaxed text-ink-600">
          An invoice shows up here when an intern pays the activation fee. Fees made free by a 100% code, and interns an admin marked paid, are listed too. Nothing has been paid yet.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/admin/transactions?source=intern" className={buttonClass({ variant: "primary", size: "md" })}>
            Open transactions
          </Link>
          <Link href="/admin/promo-codes" className={buttonClass({ variant: "outline", size: "md" })}>
            Promo codes
          </Link>
        </div>
      </div>
    );
  }

  const s = internInvoiceSummary(filtered);
  const items: (StatItem | null)[] = [
    s.discountMinor > 0 ? { label: "Discounts given", value: rupees(s.discountMinor), hint: "Promo codes on paid fees" } : null,
    s.notCollectedCount > 0 ? { label: "Not collected", value: rupees(s.notCollectedMinor), hint: `${formatNumber(s.notCollectedCount)} pending, failed or abandoned` } : null,
    s.freeCount > 0 ? { label: "Free with a 100% code", value: formatNumber(s.freeCount), hint: "No money, no tax invoice" } : null,
    s.markedPaidCount > 0 ? { label: "Marked paid by an admin", value: formatNumber(s.markedPaidCount), hint: "Listed, not counted as money received" } : null,
    s.waivedCount > 0 ? { label: "Waived by a full-waiver code", value: formatNumber(s.waivedCount), hint: "Complimentary, not money received" } : null,
  ];
  const rest = items.filter((i): i is StatItem => i !== null);

  return (
    <div className="space-y-10">
      <Overview
        lead={
          <LeadStat
            label={active ? "Fees collected, for these filters" : "Fees collected"}
            value={<RollingNumber value={s.collectedMinor / 100} currency="INR" />}
            note={`${s.invoiceCount === 0 ? "No paid invoice yet" : `${formatNumber(s.invoiceCount)} paid ${s.invoiceCount === 1 ? "invoice" : "invoices"}`}, gross. Fees waived by a code and fees paid by a college are not in it.`}
          />
        }
        rest={rest.length ? <StatList items={rest} /> : undefined}
      />

      <Section title="Activation payments" hint="Every attempt to pay the fee, newest first by default">
        <InvoiceFilterBar basePath={basePath} filters={filters} order={order} perPage={req.perPage} codes={promoCodeOptions(rows)} csvRows={filtered} active={active} moreOpen={Boolean(filters.from || filters.to || order !== "newest" || req.perPage !== 25)} />
        {total === 0 ? (
          <div className="border-t-2 border-ink-800 py-8">
            <p className="font-display text-xl font-semibold text-ink-900">Nothing matches these filters</p>
            <p className="mt-2 max-w-md text-sm text-ink-600">There are {formatNumber(rows.length)} payments in all. Clear the search and filters, or widen the dates.</p>
            <Link href={basePath} className={buttonClass({ variant: "outline", size: "md", className: "mt-5" })}>
              Clear search and filters
            </Link>
          </div>
        ) : (
          <>
            <InternInvoiceLedger rows={shown} seller={seller} />
            <InvoicePager basePath={basePath} params={params} page={page} pages={pages} total={total} perPage={req.perPage} shown={shown.length} />
          </>
        )}
      </Section>
    </div>
  );
}
