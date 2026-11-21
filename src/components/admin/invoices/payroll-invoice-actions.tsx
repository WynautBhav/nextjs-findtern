"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Eye, Loader2, Ban } from "lucide-react";

import { sendInline } from "@/components/admin/inline-control";
import { PILL, PILL_QUIET, PILL_TONAL } from "@/components/admin/invoice-actions";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PayrollInvoiceDto } from "@/lib/admin/payroll-view";
import { formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";
import { cn } from "@/lib/utils";

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base text-ink-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";

type Dialogs = "view" | "paid" | "void" | null;

const fileName = (number: string) => `Invoice-${number.replace(/\//g, "-")}.pdf`;
const usd = (minor: number) => formatMoney(minor, "USD", { zeroLabel: false, decimals: 2 });

/**
 * What staff can do with an issued payroll invoice: look at it, save the PDF and, while it is unpaid, record the
 * wire or void it. The write buttons only exist for transactions:write (the routes check it again). The invoice
 * page is the server-rendered HTML in a sandboxed iframe, the same pattern as the employer's invoice viewer.
 */
export function PayrollInvoiceActions({ invoice, canWrite, today }: { invoice: PayrollInvoiceDto; canWrite: boolean; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Dialogs>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Radix would focus the first tabbable thing, the invoice iframe, and a focused iframe swallows Escape.
  const viewerDownload = useRef<HTMLButtonElement>(null);
  const due = invoice.status === "due";

  async function download() {
    setPrinting(true);
    setError(null);
    try {
      await downloadInvoice(invoice.html, fileName(invoice.number));
    } catch {
      setError("The invoice PDF could not be generated. Try again.");
    } finally {
      setPrinting(false);
    }
  }

  function close() {
    setOpen(null);
    setDialogError(null);
    setBusy(false);
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setDialogError(null);
    const res = await sendInline({ url: `/api/admin/invoices/payroll/${encodeURIComponent(invoice.id)}`, method: "PATCH" }, body);
    setBusy(false);
    if (!res.ok) return setDialogError(res.error);
    close();
    router.refresh();
  }

  function markPaid(e: React.FormEvent) {
    e.preventDefault();
    if (reference.trim().length < 3) return setDialogError("Enter the wire reference (at least 3 characters).");
    if (!receivedOn || receivedOn > today) return setDialogError("Pick the day the wire arrived; it cannot be in the future.");
    void send({ action: "paid", reference: reference.trim(), receivedOn });
  }

  const dialogAlert = (
    <>
      {dialogError ? (
        <p role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">
          {dialogError}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-1 lg:items-end">
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        <button type="button" onClick={() => setOpen("view")} className={PILL_QUIET} aria-label={`View invoice ${invoice.number}`}>
          <Eye className="size-3.5" aria-hidden />
          View
        </button>
        <button type="button" onClick={download} disabled={printing} className={PILL_QUIET} aria-label={`Download invoice ${invoice.number}`}>
          {printing ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
          Download
        </button>
        {canWrite && due ? (
          <>
            <button type="button" onClick={() => setOpen("paid")} className={PILL_TONAL} aria-label={`Mark invoice ${invoice.number} paid`}>
              <Check className="size-3.5" aria-hidden />
              Mark paid
            </button>
            <button type="button" onClick={() => setOpen("void")} className={cn(PILL, "text-danger hover:bg-danger-soft")} aria-label={`Void invoice ${invoice.number}`}>
              <Ban className="size-3.5" aria-hidden />
              Void
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}

      <Dialog open={open === "view"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          className="apple-admin sm:max-w-4xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            viewerDownload.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Invoice {invoice.number}</DialogTitle>
            <DialogDescription className="sr-only">The invoice as the company receives it. Use Download to save it as a PDF.</DialogDescription>
          </DialogHeader>
          {/* A full HTML page the server rendered. Sandboxed with no permissions: nothing inside can run script or reach this page. */}
          <iframe title={`Invoice ${invoice.number}`} sandbox="" srcDoc={invoice.html} className="h-[65vh] w-full rounded-apple-sm border border-ink-200 bg-white" />
          <div className="flex justify-end">
            <button ref={viewerDownload} type="button" onClick={download} disabled={printing} className={buttonClass({ size: "sm" })}>
              {printing ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Download PDF
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "paid"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="apple-admin max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-[-0.02em]">Mark {invoice.number} paid</DialogTitle>
            <DialogDescription className="text-sm">
              Records the wire of {usd(invoice.totalMinor)}. It only marks this invoice paid: nobody is hired or charged by it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={markPaid} className="space-y-4" noValidate>
            <div>
              <label htmlFor="wire-ref" className="block text-sm font-medium text-ink-800">
                Wire reference
              </label>
              <input id="wire-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or SWIFT MT103 number" autoComplete="off" maxLength={120} className={field} />
            </div>
            <div>
              <label htmlFor="wire-day" className="block text-sm font-medium text-ink-800">
                Received on
              </label>
              <input id="wire-day" type="date" max={today} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={field} />
            </div>
            {dialogAlert}
            <DialogFooter>
              <button type="button" onClick={close} className={buttonClass({ variant: "ghost", size: "md" })}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
                {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                Mark as paid
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "void"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="apple-admin max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-[-0.02em]">Void {invoice.number}?</DialogTitle>
            <DialogDescription className="text-sm">
              The invoice is cancelled and disappears from the company&apos;s Orders and invoices. Its number stays here as void and is never reused. A paid invoice cannot be voided.
            </DialogDescription>
          </DialogHeader>
          {dialogAlert}
          <DialogFooter>
            <button type="button" onClick={close} className={buttonClass({ variant: "ghost", size: "md" })}>
              Keep invoice
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ action: "void" })}
              className={buttonClass({ variant: "primary", size: "md", className: "bg-danger text-white hover:bg-danger/90" })}
            >
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Void invoice
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
