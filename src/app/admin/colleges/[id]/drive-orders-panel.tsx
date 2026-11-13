"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import { rupeesToMinor } from "@/lib/drives/admin-rules";
import type { OrderDto } from "@/lib/drives/admin-db";
import { DriveImportPanel } from "./drive-import-panel";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Awaiting payment", tone: "waiting" },
  paid: { label: "Paid", tone: "paid" },
  failed: { label: "Failed", tone: "closed" },
  refunded: { label: "Refunded", tone: "closed" },
  partially_refunded: { label: "Partly refunded", tone: "closed" },
};

const field = "h-9 w-full rounded-md border border-ink-200 bg-surface px-2 text-sm touch:min-h-11";
const money = (n: number) => formatMoney(n, "INR", { zeroLabel: false });

/** Idempotency key per attempt; a retry of the same attempt reuses it. */
const newKey = () => crypto.randomUUID();

export function DriveOrdersPanel({ collegeId, orders, canMoney, canWrite, collegeName }: { collegeId: string; collegeName?: string; orders: OrderDto[]; canMoney: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [slots, setSlots] = useState("300");
  const [fee, setFee] = useState("800");
  const [credit, setCredit] = useState("");
  const [until, setUntil] = useState("");
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [attempt, setAttempt] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The reason is shown plainly until the first submit, so an untouched form does not open on a red error.
  const [tried, setTried] = useState(false);
  const [paying, setPaying] = useState<OrderDto | null>(null);
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [payAttempt, setPayAttempt] = useState(newKey);
  const [importing, setImporting] = useState<string | null>(null);

  async function send(url: string, body: unknown, key: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not work. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const feeMinor = rupeesToMinor(fee);
  const creditMinor = credit.trim() === "" ? 0 : rupeesToMinor(credit);
  const slotsN = Number(slots);
  const untilDate = until ? new Date(`${until}T23:59:59`) : null;
  const formProblem =
    !Number.isInteger(slotsN) || slotsN < 1 ? "Slots must be a whole number of 1 or more."
    : feeMinor === null || feeMinor < 1 ? "Enter the fee per student in rupees."
    : creditMinor === null ? "Enter the carried-over credit in rupees, or leave it empty."
    : creditMinor > slotsN * feeMinor ? "Credit cannot be more than the order total."
    : !untilDate || until <= today ? "Choose a code validity date in the future."
    : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (formProblem || feeMinor === null || creditMinor === null || !untilDate) return;
    const ok = await send(`/api/admin/colleges/${collegeId}/drive-orders`, { slots: slotsN, feePerStudentMinor: feeMinor, creditMinor, codeValidUntil: untilDate.toISOString() }, attempt);
    if (ok) {
      setAttempt(newKey());
      setCredit("");
    }
  }

  async function pay() {
    if (!paying || !reference.trim()) return;
    const ok = await send(`/api/admin/drive-orders/${paying.id}/payment`, { method, reference: reference.trim() }, payAttempt);
    if (ok) {
      setPaying(null);
      setReference("");
      setPayAttempt(newKey());
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <form onSubmit={create} className="grid items-end gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="New drive order">
          <label className="text-sm">Slots (students)
            <input className={field} inputMode="numeric" value={slots} onChange={(e) => setSlots(e.target.value)} />
          </label>
          <label className="text-sm">Fee per student (₹)
            <input className={field} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="text-sm">Carried-over credit (₹)
            <input className={field} inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Optional" />
          </label>
          <label className="text-sm">Codes valid until
            <input className={field} type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "sm", block: true })}>{busy ? "Saving…" : "Create order"}</button>
          <p className={`text-xs sm:col-span-2 lg:col-span-5 ${formProblem && tried ? "text-danger" : "text-ink-500"}`} role="status">
            {formProblem ?? `Total ${money(slotsN * (feeMinor ?? 0))}${creditMinor ? `, less credit ${money(creditMinor)} = payable ${money(slotsN * (feeMinor ?? 0) - creditMinor)}` : ""}.`}
          </p>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {orders.length === 0 ? (
        <EmptyScene
          compact
          title="No drive orders"
          body={canWrite ? "An order sets how many student slots this college has and what each costs. Add one with the form above." : "An order sets how many student slots this college has and what each costs. None has been added."}
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const s = STATUS[o.status] ?? { label: o.status, tone: "neutral" as Tone };
            return (
              <Surface as="li" key={o.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{o.slots} students at {money(o.feePerStudentMinor)}</p>
                    <p className="text-xs text-ink-500">
                      Total {money(o.slots * o.feePerStudentMinor)} · Payable {money(o.payableMinor)}{o.creditMinor ? ` (credit ${money(o.creditMinor)})` : ""} · codes valid until {formatDate(o.codeValidUntil)} · {o.issuedCount} issued, {o.redeemedCount} redeemed
                      {o.paidAt ? ` · paid ${formatDate(o.paidAt)}${o.gatewayRef ? ` (ref ${o.gatewayRef})` : ""}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={s.tone}>{s.label}</Pill>
                    {o.status === "pending" && canMoney ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => setPaying(o)}>Mark paid</button> : null}
                    {canWrite ? <button type="button" className={buttonClass({ variant: "light", size: "sm" })} aria-expanded={importing === o.id} onClick={() => setImporting(importing === o.id ? null : o.id)}>{importing === o.id ? "Close roster" : "Roster"}</button> : null}
                  </div>
                </div>
                {importing === o.id ? <div className="mt-4 border-t border-ink-200 pt-4"><DriveImportPanel order={o} /></div> : null}
              </Surface>
            );
          })}
        </ul>
      )}

      <Dialog open={!!paying} onOpenChange={(o) => { if (!o) setPaying(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark order paid</DialogTitle>
            <DialogDescription>{paying ? `Confirm you received ${money(paying.payableMinor)} for ${paying.slots} students${collegeName ? ` from ${collegeName}` : " from this college"}. Marking paid issues the order and cannot be undone here.` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">How it was paid
              <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="bank">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
            <label className="block text-sm">Reference (UTR, cheque number)
              <input className={field} maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <button type="button" className={buttonClass({ variant: "light", size: "sm" })} onClick={() => setPaying(null)}>Cancel</button>
            <button type="button" disabled={busy || !reference.trim()} className={buttonClass({ variant: "primary", size: "sm" })} onClick={pay}>{busy ? "Saving…" : "Mark paid"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
