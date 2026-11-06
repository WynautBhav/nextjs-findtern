"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { seatBatchAmount, seatBatchProblem } from "@/lib/college/money";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";

/** Admin: a college's seat batches, the "New batch" form and the Mark paid / Void / Invoice controls. */
export type SeatBatchRow = {
  id: string;
  seats: number;
  amountMinor: number;
  status: "pending" | "paid" | "void" | (string & {});
  method: string | null;
  referenceId: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Server-rendered invoice HTML for a paid batch, passed down for `downloadInvoice`. */
  invoiceHtml?: string | null;
};

export type CollegeSeatBatchesProps = {
  collegeId: string;
  batches: SeatBatchRow[];
  /** The college's student code (TPO promo code) and its seats; null when it has no code yet. */
  seat: { code: string; cap: number | null; used: number } | null;
  /** Money controls (create, mark paid, void) render only when true. */
  canMoney: boolean;
};

const field = "h-9 rounded-md border border-ink-200 bg-surface px-2 text-sm touch:min-h-11";

export function CollegeSeatBatches({ collegeId, batches, seat, canMoney }: CollegeSeatBatchesProps) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [seats, setSeats] = useState("300");
  const [paying, setPaying] = useState<{ id: string; method: string; ref: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/colleges/${collegeId}/seat-batches`;
  const n = Number(seats);
  const problem = seatBatchProblem(n);

  async function send(url: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not work. Try again.");
      else router.refresh();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    if (!paying || !paying.ref.trim()) return setError("Enter the payment reference.");
    const row = batches.find((b) => b.id === paying.id);
    const ok = await ask({
      title: "Mark this batch paid?",
      body: `${row?.seats} seats are added to the college's cap and an invoice number is issued. This cannot be undone.`,
      confirmLabel: "Yes, mark paid",
      destructive: false,
    });
    if (ok && (await send(`${base}/${paying.id}`, "PATCH", { action: "paid", method: paying.method, referenceId: paying.ref.trim() }))) setPaying(null);
  }

  async function voidBatch(id: string) {
    const ok = await ask({ title: "Void this batch?", body: "It will no longer be payable.", confirmLabel: "Yes, void" });
    if (ok) await send(`${base}/${id}`, "PATCH", { action: "void" });
  }

  return (
    <section className="space-y-3" aria-label="Seat batches">
      <p className="text-sm text-ink-600">
        {seat ? `Student code ${seat.code}: ${seat.used} of ${seat.cap ?? "unlimited"} seats used.` : "No code yet. It is created when the first batch is marked paid."}
      </p>
      {canMoney ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!problem) await send(base, "POST", { seats: n });
          }}
        >
          <label className="text-sm">
            <span className="block text-ink-600">Seats</span>
            <input className={`${field} w-28`} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} aria-invalid={problem ? true : undefined} />
          </label>
          <p className="nums pb-2 text-sm">{problem ?? `${formatMoney(seatBatchAmount(n), "INR", { zeroLabel: false })} (GST included)`}</p>
          <button type="submit" disabled={busy || !!problem} className={buttonClass({ variant: "dark", size: "sm" })}>New batch</button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {batches.length === 0 ? (
        <p className="text-sm text-ink-600">No seat batches yet.</p>
      ) : (
        <ul className="divide-y divide-ink-200 rounded-md border border-ink-200">
          {batches.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{b.seats} seats · {formatMoney(b.amountMinor, "INR", { zeroLabel: false })} · {b.status}</p>
                <p className="text-xs text-ink-600">
                  {formatDate(b.paidAt ?? b.createdAt)}
                  {b.status === "paid" ? ` · ${b.method} ${b.referenceId} · Invoice ${b.invoiceNumber ?? "pending"}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {b.status === "paid" && b.invoiceHtml ? (
                  <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => downloadInvoice(b.invoiceHtml!, `Invoice-${b.invoiceNumber ?? b.id.slice(-8)}.pdf`)}>Invoice</button>
                ) : null}
                {canMoney && b.status === "pending" ? (
                  paying?.id === b.id ? (
                    <>
                      <select className={field} value={paying.method} onChange={(e) => setPaying({ ...paying, method: e.target.value })} aria-label="Payment method">
                        <option value="bank">Bank</option>
                        <option value="upi">UPI</option>
                        <option value="cheque">Cheque</option>
                      </select>
                      <input className={`${field} w-44`} maxLength={64} placeholder="Reference" aria-label="Payment reference" value={paying.ref} onChange={(e) => setPaying({ ...paying, ref: e.target.value })} />
                      <button type="button" disabled={busy} className={buttonClass({ variant: "dark", size: "sm" })} onClick={markPaid}>Confirm</button>
                      <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => setPaying(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={busy} className={buttonClass({ variant: "dark", size: "sm" })} onClick={() => setPaying({ id: b.id, method: "bank", ref: "" })}>Mark paid</button>
                      <button type="button" disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => voidBatch(b.id)}>Void</button>
                    </>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
}
