import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { InvoiceCsvButton } from "@/components/admin/invoice-actions";
import type { AdminInvoiceRow, InvoiceFilters } from "@/lib/admin/invoice-rows";
import { INVOICE_ORDERS, type InvoiceOrder } from "@/lib/admin/invoice-summary";
import { PER_PAGE_OPTIONS, toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * Search, filters, order and rows per page for the Intern invoices ledger: a plain GET form, so the URL holds the
 * view (shareable, back button works, no script needed) and the pager is a pair of real links.
 */

const CONTROL =
  "h-11 w-full min-w-0 rounded-md border border-ink-300 bg-surface-raised px-3 text-base text-ink-900 outline-none placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:h-10 md:text-sm";

function Labelled({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export function InvoiceFilterBar({
  basePath,
  filters,
  order,
  perPage,
  codes,
  csvRows,
  active,
  moreOpen,
}: {
  basePath: string;
  filters: InvoiceFilters;
  order: InvoiceOrder;
  perPage: number;
  codes: string[];
  /** Every row the filters keep (not just this page): what the CSV exports. */
  csvRows: AdminInvoiceRow[];
  /** Whether any search or filter is on, to offer "Clear". */
  active: boolean;
  /** Open the dates / order / rows group: one of them is not at its default. */
  moreOpen: boolean;
}) {
  return (
    <form method="get" action={basePath} role="search" aria-label="Search and filter intern payments" className="mb-5 grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
      <Labelled label="Search" className="sm:col-span-2 lg:col-span-4">
        <span className="relative block">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-600" />
          <input type="search" name="q" defaultValue={filters.q} placeholder="Intern, email, invoice or order" className={cn(CONTROL, "pl-9 [&::-webkit-search-cancel-button]:hidden")} />
        </span>
      </Labelled>
      <Labelled label="State" className="lg:col-span-2">
        <select name="status" defaultValue={filters.status} className={CONTROL}>
          <option value="">All states</option>
          <option value="paid">Paid</option>
          <option value="created">Pending</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Labelled>
      <Labelled label="Promo code used" className="lg:col-span-3">
        <select name="promo" defaultValue={filters.promo} className={CONTROL}>
          <option value="">Any</option>
          <option value="with">With a code</option>
          <option value="without">No code</option>
        </select>
      </Labelled>
      {codes.length ? (
        <Labelled label="Which code" className="lg:col-span-3">
          <select name="code" defaultValue={filters.code} className={CONTROL}>
            <option value="">Any code</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
      ) : (
        <div className="hidden lg:col-span-3 lg:block" />
      )}
      <details open={moreOpen} className="group sm:col-span-2 lg:col-span-12">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-ink-800 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:min-h-11 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          Dates, order and rows per page
        </summary>
        <div className="mt-3 grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      <Labelled label="From" className="lg:col-span-1">
        <input type="date" name="from" defaultValue={filters.from} className={CONTROL} />
      </Labelled>
      <Labelled label="To" className="lg:col-span-1">
        <input type="date" name="to" defaultValue={filters.to} className={CONTROL} />
      </Labelled>
      <Labelled label="Order" className="lg:col-span-1">
        <select name="order" defaultValue={order} className={CONTROL}>
          {(Object.keys(INVOICE_ORDERS) as InvoiceOrder[]).map((k) => (
            <option key={k} value={k}>
              {INVOICE_ORDERS[k].label}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Rows per page" className="lg:col-span-1">
        <select name="per" defaultValue={String(perPage)} className={CONTROL}>
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Labelled>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-12">
        <button type="submit" className={buttonClass({ variant: "primary", size: "md", className: "max-sm:flex-1" })}>
          Apply
        </button>
        {active ? (
          <Link href={basePath} className={buttonClass({ variant: "outline", size: "md" })}>
            Clear
          </Link>
        ) : null}
        <span className="ml-auto max-lg:ml-0 max-sm:w-full [&>button]:max-sm:w-full [&>button]:max-sm:justify-center">
          <InvoiceCsvButton rows={csvRows} kind="intern" />
        </span>
      </div>
    </form>
  );
}

/** Previous / next as real links that keep every filter. */
export function InvoicePager({ basePath, params, page, pages, total, perPage, shown }: { basePath: string; params: Record<string, string>; page: number; pages: number; total: number; perPage: number; shown: number }) {
  const href = (p: number) => `${basePath}${toQueryString({ ...params, page: p > 1 ? String(p) : "" })}`;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const link = "inline-flex min-h-9 items-center gap-1 rounded-md border border-ink-300 px-3 text-sm font-medium text-ink-900 hover:bg-ink-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:min-h-11";
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-700">
      <p className="nums">
        Showing {from} to {from + shown - 1 < from ? from : from + shown - 1} of {total}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={link}>
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Link>
          ) : null}
          <span className="nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className={link}>
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
