"use client";

import { useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/admin/csv";
import {
  displayInvoiceNumber,
  gatewayLabel,
  hasTaxInvoice,
  INVOICE_KINDS,
  isPaidRow,
  type AdminInvoiceRow,
  type InvoiceKind,
} from "@/lib/admin/invoice-rows";
import { formatDate, formatMoney } from "@/lib/format";
import { placeOfSupply, splitGst } from "@/lib/gst";
import { downloadInvoice, taxInvoiceHtml, type InvoiceSeller } from "@/lib/invoice";
import { adminInvoiceInput } from "@/lib/admin/invoice-print";

/** Tonal pill actions, as the table toolbar's (no outline); 44px on touch. */
const PILL =
  "apple-spring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 touch:min-h-11";
const PILL_TONAL = cn(PILL, "bg-[color:var(--admin-panel-2)] hover:bg-[color:var(--admin-bar-tint)]");
const PILL_QUIET = cn(PILL, "hover:bg-[color:var(--admin-panel-2)]");

/**
 * Row actions for the two admin ledgers: the tax invoice (paid rows with
 * money only, ADM-06) and a details dialog. Client-side because the PDF is
 * rendered in the browser.
 */

const gstBase = (r: AdminInvoiceRow) => splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;
const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });

async function printInvoice(r: AdminInvoiceRow, kind: InvoiceKind, seller: InvoiceSeller) {
  const html = taxInvoiceHtml(adminInvoiceInput(r, kind, seller));
  await downloadInvoice(html, `Invoice-${r.orderId.slice(-8).toUpperCase()}.pdf`);
}

export function InvoiceRowActions({ row, kind, seller }: { row: AdminInvoiceRow; kind: InvoiceKind; seller: InvoiceSeller }) {
  const k = INVOICE_KINDS[kind];
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invoiceable = hasTaxInvoice(row);

  async function print() {
    setPrinting(true);
    setError(null);
    try {
      await printInvoice(row, kind, seller);
    } catch {
      setError("The invoice PDF could not be generated. Try again.");
    } finally {
      setPrinting(false);
    }
  }

  const invoiceButton = (
    <button type="button" onClick={print} disabled={printing} className={PILL_TONAL}>
      {printing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
      Invoice
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        {invoiceable ? invoiceButton : null}
        <button type="button" onClick={() => setOpen(true)} className={PILL_QUIET}>
          <Eye className="size-3.5" aria-hidden />
          View
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink-900">Payment details</DialogTitle>
            <DialogDescription className="text-sm text-ink-600">{k.description}</DialogDescription>
          </DialogHeader>
          <dl className="divide-y divide-ink-100 text-sm">
            <Detail label="Invoice no.">{displayInvoiceNumber(row, k.invoicePrefix) ?? "No invoice (not paid)"}</Detail>
            <Detail label="Order ID">
              <span className="nums text-xs break-all">{row.orderId}</span>
            </Detail>
            <Detail label="Payment ID">
              <span className="nums text-xs break-all">{row.paymentId || "Not captured"}</span>
            </Detail>
            <Detail label="Gateway">{gatewayLabel(row.gateway)}</Detail>
            <Detail label={k.party}>{row.partyName}</Detail>
            {row.interns ? <Detail label="Interns">{row.interns.split("; ").join(", ")}</Detail> : null}
            <Detail label="Status">
              <StatusBadge value={isPaidRow(row) ? "paid" : row.status} />
            </Detail>
            <Detail label="Amount">
              <span className="nums font-semibold">{money(row.amountMinor, row.currency)}</span>
            </Detail>
            <Detail label="GST included">
              <span className="nums">{money(row.amountMinor - gstBase(row), row.currency)}</span>
            </Detail>
            {row.promoCode || (row.discountMinor ?? 0) > 0 ? (
              <Detail label="Discount">
                <span className="nums">
                  {(row.discountMinor ?? 0) > 0 ? `− ${money(row.discountMinor ?? 0, row.currency)}` : "Amount not recorded"}
                  {row.promoCode ? ` · ${row.promoCode}` : ""}
                </span>
              </Detail>
            ) : null}
            <Detail label="Paid on">{row.paidAt ? formatDate(row.paidAt) : "-"}</Detail>
            <Detail label="Created">{formatDate(row.createdAt)}</Detail>
          </dl>
          <div className="flex items-center justify-between gap-2 pt-2">
            {invoiceable ? invoiceButton : <span className="text-sm text-ink-600">No tax invoice for unpaid or ₹0 rows.</span>}
            <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "light", size: "sm" })}>
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-ink-600">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}

/** CSV of every row the current filters keep (not just this page). */
export function InvoiceCsvButton({ rows, kind }: { rows: AdminInvoiceRow[]; kind: InvoiceKind }) {
  const k = INVOICE_KINDS[kind];
  return (
    <button
      type="button"
      onClick={() =>
        downloadCsv(k.csv, rows, [
          { header: "Invoice number", value: (r) => displayInvoiceNumber(r, k.invoicePrefix) ?? "" },
          { header: "Order ID", value: (r) => r.orderId },
          { header: "Payment ID", value: (r) => r.paymentId },
          { header: "Gateway", value: (r) => r.gateway ?? "" },
          { header: k.party, value: (r) => r.partyName },
          { header: "Email", value: (r) => r.partyEmail },
          ...(kind === "employer" ? [{ header: "Interns", value: (r: AdminInvoiceRow) => r.interns ?? "" }] : []),
          { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
          { header: "Currency", value: (r) => r.currency },
          // 18% GST is included in INR amounts; USD (export) carries none.
          { header: "Amount before GST", value: (r) => (gstBase(r) / 100).toFixed(2) },
          { header: "GST", value: (r) => ((r.amountMinor - gstBase(r)) / 100).toFixed(2) },
          { header: "Discount", value: (r) => ((r.discountMinor ?? 0) / 100).toFixed(2) },
          { header: "Promo code", value: (r) => r.promoCode ?? "" },
          { header: "Status", value: (r) => r.status },
          { header: "Needs review", value: (r) => (r.needsReview ? "yes" : "") },
          { header: "Paid at", value: (r) => r.paidAt },
          { header: "Created at", value: (r) => r.createdAt },
        ])
      }
      className={PILL_TONAL}
    >
      <Download className="size-3.5" aria-hidden />
      Export CSV
    </button>
  );
}
