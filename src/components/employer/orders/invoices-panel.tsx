"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Eye } from "lucide-react";

import { EmptyScene, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RowMenu } from "@/components/app/row-menu";
import { fieldClass, labelClass, tdClass, thClass } from "@/components/employer/ui-tokens";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";
import { matchesQuery } from "@/lib/orders-filter";
import { cn } from "@/lib/utils";
import { DmyDateInput } from "@/components/app/dmy-date-input";
import type { InvoiceRow } from "./types";
import { SearchField, ResetButton, LiveCount } from "./shared";

export function InvoicesPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [currency, setCurrency] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  // The dialog is opened by state, not by a Radix trigger, so it is told where to hand focus back to.
  const viewerOpener = useRef<HTMLElement | null>(null);
  const viewerDownload = useRef<HTMLButtonElement>(null);
  const currencies = Array.from(new Set(invoices.map((i) => i.currency)));
  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (currency !== "all" && i.currency !== currency) return false;
      const day = i.paidAt?.slice(0, 10) ?? "";
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      return matchesQuery(q, [i.number, i.orderId, i.paymentId, i.currency, day, i.paidAt ? formatDate(i.paidAt) : "", ...i.candidates, ...i.projects]);
    });
  }, [invoices, q, currency, from, to]);
  const filtering = Boolean(q) || currency !== "all" || from || to;

  if (invoices.length === 0) {
    return (
      <EmptyScene
        art
        title="No invoices yet"
        body="A tax invoice is issued for every completed payment. Cancelled or failed checkouts don't create one."
        next={{ label: "Go to checkout", href: "/employer/checkout" }}
        who="You - complete a payment"
      />
    );
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_10rem_10rem_10rem_auto] lg:items-end">
        <SearchField value={q} onChange={setQ} placeholder="Candidate, project, invoice or order ID" />
        <label className={labelClass}>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cn(fieldClass, "mt-1.5")}>
            <option value="all">All</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Paid from
          <DmyDateInput value={from} onChange={setFrom} className={cn(fieldClass, "mt-1.5")} />
        </label>
        <label className={labelClass}>
          Paid to
          <DmyDateInput value={to} onChange={setTo} className={cn(fieldClass, "mt-1.5")} />
        </label>
        <ResetButton
          enabled={Boolean(filtering)}
          onClick={() => {
            setQ("");
            setCurrency("all");
            setFrom("");
            setTo("");
          }}
        />
        <LiveCount active={Boolean(filtering)} shown={filtered.length} total={invoices.length} noun="invoices" />
      </div>

      {filtered.length === 0 ? (
        <EmptyScene title="No invoice matches" body="Try another name or ID, or reset the filters to see every invoice." className="py-10" />
      ) : (
        <Surface data-stack tabIndex={0} role="region" aria-label="Invoices" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full border-collapse lg:min-w-[48rem]">
            <thead className="border-b border-ink-100 bg-ink-50">
              <tr>
                <th scope="col" className={thClass}>Invoice</th>
                <th scope="col" className={thClass}>Candidate</th>
                <th scope="col" className={thClass}>Project</th>
                <th scope="col" className={cn(thClass, "text-right")}>Amount</th>
                <th scope="col" className={thClass}>Paid on</th>
                {/* From lg the wide table can scroll sideways, so the actions stay pinned to the right edge; below lg rows stack and nothing scrolls. */}
                <th scope="col" className={cn(thClass, "text-right lg:sticky lg:right-0 lg:bg-ink-50 lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                  <span className="sr-only">View or download</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td data-title className={tdClass}>
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="nums font-medium text-ink-900">{i.number}</p>
                      <p className="break-all font-mono text-xs text-text-subtle lg:max-w-[14rem] lg:truncate" title={i.orderId}>
                        {i.orderId}
                      </p>
                    </div>
                  </td>
                  <td data-label="Candidate" className={cn(tdClass, "[overflow-wrap:anywhere]")}>{i.candidates.join(", ") || "-"}</td>
                  <td data-label="Project" className={cn(tdClass, "[overflow-wrap:anywhere]")}>{i.projects.join(", ") || "-"}</td>
                  <td data-label="Amount" className={cn(tdClass, "nums text-right font-semibold text-ink-900")}>
                    {formatMoney(i.amountMinor, i.currency, { zeroLabel: false })}
                  </td>
                  <td data-label="Paid on" className={cn(tdClass, "nums")}>{i.paidAt ? formatDate(i.paidAt) : "-"}</td>
                  <td className={cn(tdClass, "text-right lg:sticky lg:right-0 lg:bg-white lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          viewerOpener.current = e.currentTarget;
                          setViewing(i);
                        }}
                        aria-label={`View invoice ${i.number}`}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Eye className="size-4" aria-hidden />
                        View
                      </button>
                      <RowMenu
                        label={`More actions for invoice ${i.number}`}
                        items={[{ label: "Download", icon: <Download />, onSelect: () => downloadInvoice(i.html, invoiceFileName(i)) }]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent
          className="sm:max-w-4xl"
          // Radix would focus the first tabbable thing, the invoice iframe, and a focused iframe swallows Escape.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            viewerDownload.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (viewerOpener.current?.isConnected) viewerOpener.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tax invoice {viewing?.number}</DialogTitle>
            <DialogDescription className="sr-only">The invoice as it prints. Use Download to save it as a PDF.</DialogDescription>
          </DialogHeader>
          {viewing ? (
            // A full HTML page the server rendered. Sandboxed with no permissions, so
            // nothing inside it can run script or reach this page.
            <iframe title={`Invoice ${viewing.number}`} sandbox="" srcDoc={viewing.html} className="h-[65vh] w-full rounded-apple-sm border border-ink-200 bg-white" />
          ) : null}
          <div className="flex justify-end">
            <button
              ref={viewerDownload}
              type="button"
              onClick={() => viewing && downloadInvoice(viewing.html, invoiceFileName(viewing))}
              className={buttonClass({ size: "sm" })}
            >
              <Download className="size-4" aria-hidden />
              Download
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const invoiceFileName = (i: Pick<InvoiceRow, "number">) => `Invoice-${i.number.replace(/\//g, "-")}.pdf`;

