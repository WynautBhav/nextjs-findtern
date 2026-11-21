"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";

import { PILL_TONAL } from "@/components/admin/invoice-actions";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, formProblem, formTotalMinor, issueBody, minorToDollars, type FormLine } from "@/lib/admin/payroll-form";
import type { DraftLineDto } from "@/lib/admin/payroll-view";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { formatPeriod } from "@/lib/invoice-premium";

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base text-ink-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";
const label = "block text-sm font-medium text-ink-800";

/**
 * Prepare and issue the monthly payroll invoice of one approved period. The lines start as the draft (salary =
 * CTC / 12, overtime = hours x the offer's rate, the $50 fee) and are all editable; staff may add or drop a line
 * (a bonus, an adjustment). Issuing is final: the server numbers the invoice and no endpoint edits it afterwards,
 * so the dialog says so before the button, and the button names the act.
 */
export function PrepareInvoiceDialog({
  proposalId,
  company,
  intern,
  period,
  draft,
  today,
}: {
  proposalId: string;
  company: string;
  intern: string;
  period: { start: string; end: string };
  draft: DraftLineDto[];
  /** The India day, from the server, so the due date does not depend on the browser's clock. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fresh = (): FormLine[] => draft.map((l) => ({ key: l.key, label: l.label, detail: l.detail, amount: minorToDollars(l.amountMinor) }));
  const [lines, setLines] = useState<FormLine[]>(fresh);
  const [dueOn, setDueOn] = useState(() => addDays(today, 7));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ number: string; totalMinor: number } | null>(null);
  const total = formTotalMinor(lines);
  const periodText = formatPeriod(period.start, period.end);

  function reset() {
    setLines(fresh());
    setDueOn(addDays(today, 7));
    setNote("");
    setError(null);
    setBusy(false);
  }

  function change(i: number, patch: Partial<FormLine>) {
    setLines((all) => all.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    const problem = formProblem(lines, dueOn, today);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/invoices/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issueBody({ proposalId, period, lines, dueOn, note })),
      });
      const data = (await res.json().catch(() => ({}))) as { invoiceNumber?: string; totalMinor?: number; error?: string };
      if (!res.ok || !data.invoiceNumber) throw new Error(data.error || `The invoice was not issued (HTTP ${res.status}).`);
      setIssued({ number: data.invoiceNumber, totalMinor: data.totalMinor ?? total });
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Nothing was issued; try again." : err instanceof Error ? err.message : "The invoice was not issued.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    const wasIssued = issued !== null;
    setOpen(false);
    setIssued(null);
    reset();
    if (wasIssued) router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={PILL_TONAL} aria-label={`Prepare invoice for ${intern}, ${periodText}`}>
        <FileText className="size-3.5" aria-hidden />
        Prepare invoice
      </button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="apple-admin max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-[-0.02em]">{issued ? "Invoice issued" : `Invoice for ${intern}`}</DialogTitle>
            <DialogDescription className="text-sm">
              {issued ? `${issued.number} is numbered and final.` : `${company} · ${periodText} · billed in US dollars.`}
            </DialogDescription>
          </DialogHeader>

          {issued ? (
            <div className="space-y-4">
              <p role="status" className="rounded-apple-sm bg-[color:var(--admin-panel-2)] p-4 text-sm text-ink-800">
                <span className="nums font-semibold text-ink-900">{issued.number}</span> for{" "}
                <span className="nums font-semibold text-ink-900">{formatMoney(issued.totalMinor, "USD", { zeroLabel: false, decimals: 2 })}</span> is now on the company&apos;s Orders and invoices page. Record the wire here once it arrives.
              </p>
              <DialogFooter>
                <button type="button" onClick={close} className={buttonClass({ variant: "primary", size: "md" })}>
                  Done
                </button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={issue} className="space-y-5" noValidate>
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-ink-900">Lines</legend>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-apple-sm bg-[color:var(--admin-panel-2)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_auto] sm:items-end sm:bg-transparent sm:p-0">
                    <div className="col-span-2 sm:col-span-1">
                      <label className={label} htmlFor={`pl-label-${i}`}>
                        {i === 0 ? "Label" : <span className="sm:sr-only">Label</span>}
                      </label>
                      <input id={`pl-label-${i}`} value={l.label} onChange={(e) => change(i, { label: e.target.value })} maxLength={120} autoComplete="off" className={field} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={label} htmlFor={`pl-detail-${i}`}>
                        {i === 0 ? "Detail (optional)" : <span className="sm:sr-only">Detail (optional)</span>}
                      </label>
                      <input id={`pl-detail-${i}`} value={l.detail} onChange={(e) => change(i, { detail: e.target.value })} maxLength={200} autoComplete="off" className={field} />
                    </div>
                    <div>
                      <label className={label} htmlFor={`pl-amount-${i}`}>
                        {i === 0 ? "Amount ($)" : <span className="sm:sr-only">Amount ($)</span>}
                      </label>
                      <input id={`pl-amount-${i}`} value={l.amount} onChange={(e) => change(i, { amount: e.target.value })} inputMode="decimal" autoComplete="off" className={`${field} nums text-right`} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((all) => all.filter((_, n) => n !== i))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${l.label.trim() || i + 1}`}
                      className="grid size-11 place-items-center justify-self-end rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 max-sm:self-end sm:mt-0"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[color:var(--admin-rule)] pt-4">
                <button
                  type="button"
                  onClick={() => setLines((all) => [...all, { key: "extra", label: "", detail: "", amount: "" }])}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a line
                </button>
                <p className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-ink-700">Total (USD)</span>
                  <output aria-live="polite" className="nums text-2xl font-semibold tracking-[-0.02em] text-ink-900">
                    {formatMoney(total, "USD", { zeroLabel: false, decimals: 2 })}
                  </output>
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="pl-due">
                    Due date
                  </label>
                  <input id="pl-due" type="date" min={today} value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="pl-note">
                    Note on the invoice (optional)
                  </label>
                  <textarea id="pl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={1} className={`${field} min-h-11 py-2`} />
                </div>
              </div>

              <div className="rounded-apple-sm bg-warning-soft p-3.5 text-sm leading-relaxed text-ink-900">
                <p className="font-semibold">Issuing is final.</p>
                <p className="mt-0.5">
                  The invoice gets its number now and cannot be edited, and {company} sees it right away. If something is wrong, void it (only while unpaid) and issue a new one; a voided number is never reused.
                </p>
              </div>

              {error ? (
                <p role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <button type="button" onClick={close} className={buttonClass({ variant: "ghost", size: "md" })}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
                  {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  Issue invoice
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
