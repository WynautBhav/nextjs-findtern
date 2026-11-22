"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import { rupeesToMinor } from "@/lib/drives/admin-rules";
import { withGst } from "@/lib/college/drive-order";
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

/** Where an order stands: the three things that have to happen, in order. */
function stepOf(o: OrderDto): 0 | 1 | 2 | 3 {
  if (o.status === "pending") return 0;
  if (o.status !== "paid") return 3;
  if (o.issuedCount === 0) return 1;
  return o.issuedCount < o.slots ? 2 : 3;
}

const STEPS = ["Payment received", "Students added", "Codes sent"] as const;

/**
 * The one way a college is charged: an order (students x fee), one payment, then the students, who are each emailed
 * a personal code. Every order shows which of those three steps it is on and offers only the next action.
 */
export function DriveOrdersPanel({ collegeId, orders, canMoney, canWrite, collegeName, defaultFeeMinor = 80000, rosterCount = 0 }: { collegeId: string; collegeName?: string; orders: OrderDto[]; canMoney: boolean; canWrite: boolean; /** The admin-set starting fee before GST (Colleges page); each order stores its own fee with GST. */ defaultFeeMinor?: number; /** Students on the college's own list, offered as the source for step 2. */ rosterCount?: number }) {
  const router = useRouter();
  const [slots, setSlots] = useState("300");
  const [fee, setFee] = useState(() => String(defaultFeeMinor / 100));
  const [credit, setCredit] = useState("");
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  // Codes are good for 90 days unless the admin picks another date (the field is under "More options").
  const [until, setUntil] = useState(() => new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10));
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

  // The admin types the fee before GST; the order stores and charges it with 18% GST (₹800 -> ₹944).
  const baseMinor = rupeesToMinor(fee);
  const feeMinor = baseMinor === null ? null : withGst(baseMinor);
  const creditMinor = credit.trim() === "" ? 0 : rupeesToMinor(credit);
  const slotsN = Number(slots);
  const untilDate = until ? new Date(`${until}T23:59:59`) : null;
  const formProblem =
    !Number.isInteger(slotsN) || slotsN < 1 ? "Slots must be a whole number of 1 or more."
    : baseMinor === null || baseMinor < 1 ? "Enter the fee per student in rupees, before GST."
    : creditMinor === null ? "Enter the carried-over credit in rupees, or leave it empty."
    : feeMinor === null || creditMinor > slotsN * feeMinor ? "Credit cannot be more than the order total."
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
    <div className="space-y-5">
      {canWrite ? (
        <form onSubmit={create} className="rounded-xl border border-ink-200 bg-surface p-4" aria-label="New order">
          <p className="text-sm font-semibold text-ink-900">New order</p>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-sm">Students
              <input className={field} inputMode="numeric" value={slots} onChange={(e) => setSlots(e.target.value)} />
            </label>
            <label className="text-sm">Fee per student, before GST (₹)
              <input className={field} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
            <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "sm" })}>{busy ? "Saving…" : "Create order"}</button>
          </div>
          <p className={`mt-2 text-sm ${formProblem && tried ? "text-danger" : "text-ink-600"}`} role="status">
            {formProblem ?? (
              <>
                {money(baseMinor ?? 0)} + 18% GST = <span className="nums text-ink-900">{money(feeMinor ?? 0)}</span> per student. The college pays <strong className="nums text-ink-900">{money(slotsN * (feeMinor ?? 0) - (creditMinor ?? 0))}</strong>
                {creditMinor ? ` (${money(slotsN * (feeMinor ?? 0))} less ${money(creditMinor)} credit)` : ""}. Codes work until {formatDate(`${until}T00:00:00`)}.
              </>
            )}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">More options</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Carried-over credit (₹)
                <input className={field} inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Optional" />
              </label>
              <label className="text-sm">Codes valid until
                <input className={field} type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            </div>
          </details>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {orders.length === 0 ? (
        <EmptyScene
          compact
          title="No orders yet"
          body={canWrite ? "An order says how many students this college is paying for and the fee for each. Create one above; you then record the payment and add the students." : "An order says how many students this college is paying for and the fee for each. None has been added."}
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const s = STATUS[o.status] ?? { label: o.status, tone: "neutral" as Tone };
            const step = stepOf(o);
            const live = o.status === "pending" || o.status === "paid";
            const open = importing === o.id;
            return (
              <Surface as="li" key={o.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink-900"><span className="nums">{o.slots}</span> {o.slots === 1 ? "student" : "students"} at <span className="nums">{money(o.feePerStudentMinor)}</span> <span className="text-sm font-normal text-ink-600">incl. GST</span></p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      Payable {money(o.payableMinor)}{o.creditMinor ? ` (${money(o.slots * o.feePerStudentMinor)} less ${money(o.creditMinor)} credit)` : ""}
                      {o.paidAt ? ` · paid ${formatDate(o.paidAt)}${o.gatewayRef ? `, ref ${o.gatewayRef}` : ""}` : ""} · codes valid until {formatDate(o.codeValidUntil)}
                    </p>
                  </div>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </div>

                {live ? (
                  <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Order steps">
                    {STEPS.map((label, i) => {
                      const done = i < step;
                      const current = i === step;
                      return (
                        <li key={label} aria-current={current ? "step" : undefined} className={`rounded-lg border px-3 py-2.5 ${current ? "border-brand-400 bg-brand-50/70" : done ? "border-ink-200 bg-surface" : "border-dashed border-ink-200"}`}>
                          <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                            <span aria-hidden className={`nums grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${done ? "bg-brand-700 text-white" : current ? "bg-white text-brand-800 ring-1 ring-brand-400" : "bg-ink-100 text-ink-600"}`}>{done ? <Check className="size-3" /> : i + 1}</span>
                            {label}
                            <span className="sr-only">{done ? " (done)" : current ? " (next)" : ""}</span>
                          </p>
                          <p className="nums mt-1 text-xs text-ink-600">
                            {i === 0 ? (done ? money(o.payableMinor) : `Waiting for ${money(o.payableMinor)}`) : i === 1 ? `${o.issuedCount} of ${o.slots} students` : `${o.redeemedCount} of ${o.issuedCount} codes used`}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}

                {live ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {step === 0 && canMoney ? <button type="button" className={buttonClass({ variant: "primary", size: "sm" })} onClick={() => setPaying(o)}>Record payment</button> : null}
                    {canWrite ? (
                      <button type="button" className={buttonClass({ variant: step === 1 || step === 2 ? "primary" : "outline", size: "sm" })} aria-expanded={open} onClick={() => setImporting(open ? null : o.id)}>
                        {open ? "Close" : o.issuedCount ? "Add more students" : "Add students"}
                      </button>
                    ) : null}
                    {step === 0 ? <p className="text-xs text-ink-600">You can check the student list now. Codes are sent once the payment is recorded.</p> : null}
                  </div>
                ) : null}
                {open ? <div className="mt-4 border-t border-ink-200 pt-4"><DriveImportPanel order={o} rosterCount={rosterCount} /></div> : null}
              </Surface>
            );
          })}
        </ul>
      )}

      <Dialog open={!!paying} onOpenChange={(o) => { if (!o) setPaying(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
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
            <button type="button" disabled={busy || !reference.trim()} className={buttonClass({ variant: "primary", size: "sm" })} onClick={pay}>{busy ? "Saving…" : "Record payment"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
