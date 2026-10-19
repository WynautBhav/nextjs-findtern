"use client";

/**
 * Create a payout, and mark one paid.
 *
 * Stipends leave by bank transfer, which means a human does it and a human
 * records it. Those two buttons are the whole workflow, and the legacy admin
 * had both. The rewrite has the endpoints and no buttons, so the money trail
 * existed only in the database.
 *
 * `referenceId` is required before a payout can be marked paid, not because the
 * form likes being awkward but because the reference is what ties this row to a
 * bank statement three months from now. The API does not enforce it - the UI
 * does, and says why.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Plus } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import type { StipendDue } from "@/lib/admin/stipend-dues";

type Payout = {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  method: string;
  referenceId: string | null;
  notes: string | null;
  paidAt: Date | string | null;
  createdAt: Date | string | null;
};

export function InternPayoutTools({
  internId,
  payouts,
  placements = [],
  dues = [],
}: {
  internId: string;
  payouts: Payout[];
  /** Hired proposals this payout can be filed against. */
  placements?: { id: string; employerId: string; label: string }[];
  /** What is still owed per placement (legacy dues table); prefills the form. */
  dues?: StipendDue[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [method, setMethod] = useState("bank");
  const [notes, setNotes] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [proposalId, setProposalId] = useState(placements.length === 1 ? placements[0].id : "");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!scheduledFor) {
      setError("Pick the date this payout is scheduled for.");
      return;
    }
    const placement = placements.find((p) => p.id === proposalId);
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/payouts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor: Math.round(rupees * 100),
          currency,
          method,
          status: "pending",
          scheduledFor,
          source: "admin",
          ...(placement ? { proposalId: placement.id, employerId: placement.employerId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the payout.");
      setAmount("");
      setNotes("");
      setScheduledFor("");
      setOpen(false);
      setNotice("Payout recorded as pending.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the payout.");
    } finally {
      setBusy(null);
    }
  }

  function prefill(d: StipendDue) {
    setAmount(String(d.monthlyShareMinor / 100));
    setCurrency("INR");
    setScheduledFor(d.nextDate ?? "");
    setProposalId(d.proposalId);
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  async function resendEmail(payout: Payout) {
    setBusy(`mail:${payout.id}`);
    setError(null);
    setNotice(null);
    try {
      const res = await csrfFetch(
        `/api/admin/interns/${encodeURIComponent(internId)}/payouts/${encodeURIComponent(payout.id)}/resend-email`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send the email.");
      setNotice("Stipend email sent again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the email.");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(payout: Payout) {
    const reference = window.prompt(
      `Bank reference for ${formatMoney(payout.amountMinor, payout.currency as "INR" | "USD")}.\nThis is what ties the payout to a bank statement later, so it is required.`,
      payout.referenceId ?? "",
    );
    if (reference === null) return;
    if (!reference.trim()) {
      setError("A payout cannot be marked paid without a reference.");
      return;
    }
    setBusy(payout.id);
    setError(null);
    setNotice(null);
    try {
      const res = await csrfFetch(
        `/api/admin/interns/${encodeURIComponent(internId)}/payouts/${encodeURIComponent(payout.id)}/mark-paid`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ referenceId: reference.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not mark the payout paid.");
      setNotice(
        data.next?.scheduledFor
          ? `Payout marked paid. Next month queued as pending for ${data.next.scheduledFor}.`
          : "Payout marked paid.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark the payout paid.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {payouts.length === 0 ? (
        <p className="text-sm text-ink-600">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums text-ink-900">
                  {formatMoney(p.amountMinor, p.currency as "INR" | "USD")}
                </p>
                <p className="text-2xs text-ink-600">
                  {p.method}
                  {p.referenceId ? ` · ref ${p.referenceId}` : " · no reference"}
                  {p.notes ? ` · ${p.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    p.status === "paid"
                      ? "rounded-full bg-brand-100 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-brand-800"
                      : p.status === "failed"
                        ? "rounded-full bg-danger-soft px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-danger"
                        : "rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-600"
                  }
                >
                  {p.status}
                </span>
                {p.status !== "paid" ? (
                  <button
                    type="button"
                    onClick={() => markPaid(p)}
                    disabled={busy !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-60"
                  >
                    {busy === p.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-3.5" aria-hidden />
                    )}
                    Mark paid
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => resendEmail(p)}
                    disabled={busy !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-60"
                  >
                    {busy === `mail:${p.id}` ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Mail className="size-3.5" aria-hidden />
                    )}
                    Resend email
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dues.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-ink-100">
          <table className="w-full min-w-[560px] text-left text-xs">
            <caption className="sr-only">Stipend still owed per placement</caption>
            <thead className="bg-ink-50 text-2xs uppercase tracking-[0.08em] text-ink-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Placement</th>
                <th scope="col" className="px-3 py-2 font-semibold">Paid</th>
                <th scope="col" className="px-3 py-2 font-semibold">Monthly share</th>
                <th scope="col" className="px-3 py-2 font-semibold">Still owed</th>
                <th scope="col" className="px-3 py-2 font-semibold">Next due</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {dues.map((d) => (
                <tr key={d.proposalId}>
                  <td className="px-3 py-2 text-ink-800">{placements.find((p) => p.id === d.proposalId)?.label ?? "Placement"}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">
                    {d.paidMonths} of {d.months}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">
                    {d.monthlyShareMinor > 0 ? formatMoney(d.monthlyShareMinor, "INR") : "No stipend (score below 6)"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{formatMoney(d.remainingMinor, "INR")}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{d.nextDate ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    {d.pending ? (
                      <span className="text-2xs text-ink-600">Pending payout exists</span>
                    ) : d.remainingMonths > 0 && d.monthlyShareMinor > 0 ? (
                      <button
                        type="button"
                        onClick={() => prefill(d)}
                        className="text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
                      >
                        Prefill payout
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <form onSubmit={create} className="space-y-3 rounded-lg border border-ink-100 bg-ink-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="payout-amount" className="block text-xs font-medium text-ink-700">
                Amount
              </label>
              <input
                id="payout-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="2499"
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
              />
            </div>
            <div>
              <label htmlFor="payout-currency" className="block text-xs font-medium text-ink-700">
                Currency
              </label>
              <select
                id="payout-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "INR" | "USD")}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label htmlFor="payout-method" className="block text-xs font-medium text-ink-700">
                Method
              </label>
              <select
                id="payout-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
              >
                <option value="bank">Bank transfer</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="payout-scheduled" className="block text-xs font-medium text-ink-700">
                Scheduled for
              </label>
              <input
                id="payout-scheduled"
                type="date"
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
              />
            </div>
            <div>
              <label htmlFor="payout-placement" className="block text-xs font-medium text-ink-700">
                Placement
              </label>
              <select
                id="payout-placement"
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
              >
                <option value="">Not linked</option>
                {placements.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="payout-notes" className="block text-xs font-medium text-ink-700">
              Notes
            </label>
            <input
              id="payout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Which proposal this covers"
              className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy !== null}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {busy === "create" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Record payout
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-ink-600 underline-offset-4 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
        >
          <Plus className="size-3.5" aria-hidden />
          Record a payout
        </button>
      )}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-brand-700">
          {notice}
        </p>
      ) : null}
    </div>
  );
}