"use client";

import { FILTER_BUTTON, FilterField } from "@/components/admin/filter-controls";
import { useState } from "react";
import { Download, Eye, Loader2, Mail } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { downloadCsv } from "@/lib/admin/csv";
import { invoiceCsvColumns } from "@/lib/admin/invoice-csv";
import {
  displayInvoiceNumber,
  displayStatus,
  gatewayLabel,
  hasTaxInvoice,
  INVOICE_KINDS,
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // Employer orders only: the mail goes to the company's address on the order.
  async function resend() {
    setSending(true);
    setError(null);
    setSent(null);
    try {
      const res = await csrfFetch(`/api/admin/orders/${encodeURIComponent(row.orderId)}/resend-invoice`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) setSent(`Sent to ${row.partyEmail}`);
      else setError(body.error ?? "The invoice could not be sent.");
    } catch {
      setError("The invoice could not be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

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
            <Detail label="Invoice no.">{displayInvoiceNumber(row, k.invoicePrefix) ?? (row.flagOnly ? "No invoice (marked paid by an admin)" : row.status === "paid" ? "No invoice (nothing was charged)" : "No invoice (not paid)")}</Detail>
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
              <StatusBadge value={displayStatus(row)} />
            </Detail>
            <Detail label="Amount">
              <span className="nums font-semibold">{money(row.amountMinor, row.currency)}</span>
            </Detail>
            {(row.refundedMinor ?? 0) > 0 ? (
              <Detail label="Refunded">
                <span className="nums">
                  {money(row.refundedMinor ?? 0, row.currency)} · net {money(Math.max(0, row.amountMinor - (row.refundedMinor ?? 0)), row.currency)}
                </span>
              </Detail>
            ) : null}
            {row.reviewReasons?.length ? (
              <Detail label="Needs review">
                <span className="text-danger">{row.reviewReasons.join(". ")}</span>
              </Detail>
            ) : null}
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
          {sent ? <p role="status" className="text-sm font-medium text-brand-700">{sent}</p> : null}
          {error && open ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
          <div className="flex items-center justify-between gap-2 pt-2">
            {invoiceable ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {invoiceButton}
                {kind === "employer" ? (
                  <button type="button" onClick={resend} disabled={sending} className={PILL_TONAL}>
                    {sending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
                    Resend
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="text-sm text-ink-600">No tax invoice for unpaid, ₹0 or marked-paid rows.</span>
            )}
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

/** The screen's clock (IST), not the UTC ISO string: an accountant reads 4 Nov, not 3 Nov. */

/** CSV of every row the current filters keep (not just this page). */
export function InvoiceCsvButton({ rows, kind }: { rows: AdminInvoiceRow[]; kind: InvoiceKind }) {
  const k = INVOICE_KINDS[kind];
  return (
    <FilterField>
      <button type="button" onClick={() => downloadCsv(k.csv, rows, invoiceCsvColumns(kind))} className={FILTER_BUTTON}>
        <Download className="size-4" aria-hidden />
        Export CSV
      </button>
    </FilterField>
  );
}
