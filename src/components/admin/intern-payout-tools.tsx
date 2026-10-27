"use client";

/**
 * Stipend payouts for one intern (Candidate 360, Payments tab).
 *
 * Two tables, in the order staff use them:
 *  1. Dues by placement - what is owed per hired placement, next to what the
 *     employer has paid for it (ADP-19). A payout starts here, from the
 *     placement's row (ADP-29): prefilled with the month owed and its date,
 *     at most one month's share, INR only, refused while one is pending or
 *     when the share is ₹0. The API enforces every one of these.
 *  2. Payouts - every row recorded, scheduled date first, settled inline with
 *     a bank reference (pending rows only, ADP-31).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Mail, Plus } from "lucide-react";

import { inlineFieldClass } from "@/components/admin/inline-control";
import { PayoutEditor } from "@/components/admin/payout-editor";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pill } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import { payoutCapMinor, type StipendDue } from "@/lib/admin/stipend-dues";
import { cn } from "@/lib/utils";

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
  raw?: unknown;
};

type DueRow = StipendDue & { companyName?: string; projectName?: string };

const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
const rawOf = (p: Payout) => (p.raw && typeof p.raw === "object" ? (p.raw as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function readCsrf(): string | null {
  const m = typeof document === "undefined" ? null : document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function InternPayoutTools({
  internId,
  payouts,
  placements = [],
  dues: initialDues = [],
}: {
  internId: string;
  payouts: Payout[];
  /** Hired proposals, for labels before the dues load. */
  placements?: { id: string; employerId: string; label: string }[];
  /** Dues computed by the page; replaced by the server's (with the employer side) once loaded. */
  dues?: StipendDue[];
}) {
  const router = useRouter();
  const [dues, setDues] = useState<DueRow[]>(initialDues);
  const [duesError, setDuesError] = useState<string | null>(null);
  const [form, setForm] = useState<{ due: DueRow; amount: string; scheduledFor: string; months: number; method: "bank" | "upi"; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-read the dues whenever the payout rows change (a payout created,
  // settled or queued), so the buttons never act on a stale "owed".
  const payoutKey = payouts.map((p) => `${p.id}:${p.status}`).join(",");
  useEffect(() => {
    let live = true;
    const csrf = readCsrf();
    fetch(`/api/admin/interns/${encodeURIComponent(internId)}/payouts/dues`, {
      headers: csrf ? { "x-csrf-token": csrf } : undefined,
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { dues?: DueRow[]; error?: string } | null;
        if (!live) return;
        if (!res.ok || !data?.dues) {
          setDuesError(data?.error ?? "Couldn't load what the employer has paid.");
          return;
        }
        setDuesError(null);
        setDues(data.dues);
      })
      .catch(() => {
        if (live) setDuesError("Couldn't load what the employer has paid.");
      });
    return () => {
      live = false;
    };
  }, [internId, payoutKey]);

  const labelOf = (d: DueRow) =>
    d.companyName
      ? `${d.companyName}${d.projectName ? ` · ${d.projectName}` : ""}`
      : placements.find((p) => p.id === d.proposalId)?.label ?? "Placement";

  const placementLabel = new Map<string, string>();
  for (const p of placements) placementLabel.set(p.id, p.label);
  for (const d of dues) if (d.companyName) placementLabel.set(d.proposalId, labelOf(d));

  const sorted = useMemo(
    () =>
      [...payouts].sort((a, b) => {
        const ka = str(rawOf(a).scheduledFor) ?? String(a.createdAt ?? "");
        const kb = str(rawOf(b).scheduledFor) ?? String(b.createdAt ?? "");
        return kb.localeCompare(ka);
      }),
    [payouts],
  );

  function open(d: DueRow) {
    setError(null);
    setNotice(null);
    setForm({
      due: d,
      amount: String(payoutCapMinor(d) / 100),
      scheduledFor: d.nextDate ?? "",
      months: d.remainingMonths,
      method: "bank",
      note: "",
    });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const cap = payoutCapMinor(form.due);
    const amountMinor = Math.round(Number(form.amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) return setError("Enter an amount greater than zero.");
    if (amountMinor > cap) return setError(`At most ${inr(cap)}: one month's stipend still owed.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.scheduledFor)) return setError("Pick the date this payout is due.");
    setBusy("create");
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/payouts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          currency: "INR",
          method: form.method,
          proposalId: form.due.proposalId,
          scheduledFor: form.scheduledFor,
          months: form.months,
          ...(form.note.trim() ? { opsNote: form.note.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the payout.");
      setForm(null);
      setNotice("Payout created as pending. Mark it paid once the transfer has gone.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the payout.");
    } finally {
      setBusy(null);
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setBusy(null);
    }
  }

  const th = "sticky top-0 bg-ink-50 px-3 py-2.5 text-left text-xs font-semibold text-ink-600";
  const td = "px-3 py-3 align-top text-sm text-ink-700";

  return (
    <div className="space-y-8">
      {/* Dues by placement */}
      <section aria-labelledby="dues-head" className="space-y-3">
        <div>
          <h4 id="dues-head" className="text-base font-semibold text-ink-900">Dues by placement</h4>
          <p className="mt-0.5 text-sm text-ink-600">
            Half the employer&apos;s monthly amount, paid after each month worked. Create a payout from the placement&apos;s row.
          </p>
        </div>
        {duesError ? (
          <p role="alert" className="text-sm text-danger">
            {duesError} The employer columns are missing until it loads.
          </p>
        ) : null}
        {dues.length === 0 ? (
          <p className="rounded-apple-md border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-600">
            No hired internship placements, so nothing is owed. Full-time hires have no stipend.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-apple-md border border-ink-200/80">
            <table className="w-full min-w-[56rem] text-left">
              <caption className="sr-only">Stipend owed per placement</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Placement</th>
                  <th scope="col" className={th}>Months paid</th>
                  <th scope="col" className={cn(th, "text-right")}>Monthly</th>
                  <th scope="col" className={cn(th, "text-right")}>Paid</th>
                  <th scope="col" className={cn(th, "text-right")}>Due</th>
                  <th scope="col" className={th}>Next date</th>
                  <th scope="col" className={th}>Employer paid</th>
                  <th scope="col" className={th}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {dues.map((d) => {
                  const reason =
                    d.monthlyShareMinor <= 0
                      ? "No stipend: score below 6"
                      : d.remainingMonths <= 0
                        ? "Completed"
                        : d.pending
                          ? "Payout pending"
                          : null;
                  return (
                    <tr key={d.proposalId}>
                      <td className={cn(td, "font-medium text-ink-900")}>{labelOf(d)}</td>
                      <td className={cn(td, "nums whitespace-nowrap")}>
                        {d.paidMonths} of {d.months}
                      </td>
                      <td className={cn(td, "nums whitespace-nowrap text-right")}>{d.monthlyShareMinor > 0 ? inr(d.monthlyShareMinor) : "None"}</td>
                      <td className={cn(td, "nums whitespace-nowrap text-right")}>{inr(d.paidMinor ?? 0)}</td>
                      <td className={cn(td, "nums whitespace-nowrap text-right font-semibold text-ink-900")}>{inr(d.remainingMinor)}</td>
                      <td className={cn(td, "nums whitespace-nowrap")}>{d.nextDate ? formatDate(d.nextDate) : "-"}</td>
                      <td className={td}>
                        {d.employer ? (
                          <>
                            <span className="nums">{d.employer.paidInFull ? "In full" : `${d.employer.paidMonths} of ${d.employer.months} months`}</span>
                            {d.employer.dueMinor > 0 ? (
                              <span className="nums block text-xs text-ink-600">{formatMoney(d.employer.dueMinor, d.employer.currency)} still to pay</span>
                            ) : null}
                            {d.aheadOfEmployer ? (
                              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-700">
                                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                                Employer hasn&apos;t paid this month yet
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-ink-500">-</span>
                        )}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        {reason ? (
                          <Pill tone={reason === "Payout pending" ? "waiting" : "closed"}>{reason}</Pill>
                        ) : (
                          <button
                            type="button"
                            onClick={() => open(d)}
                            disabled={busy !== null}
                            className={buttonClass({ variant: "outline", size: "sm" })}
                          >
                            <Plus className="size-3.5" aria-hidden />
                            Create payout
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {form ? (
          <form
            onSubmit={create}
            onKeyDown={(e) => {
              if (e.key === "Escape") setForm(null);
            }}
            aria-label={`Create payout for ${labelOf(form.due)}`}
            className="space-y-4 rounded-apple-lg border border-brand-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div>
              <p className="text-base font-semibold text-ink-900">New payout · {labelOf(form.due)}</p>
              <p className="mt-0.5 text-sm text-ink-600">
                Month {form.due.paidMonths + 1} of {form.due.months}. At most {inr(payoutCapMinor(form.due))}, in INR.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm font-medium text-ink-700">
                Amount (₹)
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  inputMode="decimal"
                  required
                  className={cn(inlineFieldClass, "nums mt-1")}
                />
              </label>
              <label className="block text-sm font-medium text-ink-700">
                Payout date
                <input
                  type="date"
                  value={form.scheduledFor}
                  onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                  required
                  className={cn(inlineFieldClass, "mt-1")}
                />
              </label>
              <label className="block text-sm font-medium text-ink-700">
                Method
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value === "upi" ? "upi" : "bank" })}
                  className={cn(inlineFieldClass, "mt-1")}
                >
                  <option value="bank">Bank transfer</option>
                  <option value="upi">UPI</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-ink-700">
                Months in this series
                <select
                  value={form.months}
                  onChange={(e) => setForm({ ...form, months: Number(e.target.value) })}
                  className={cn(inlineFieldClass, "mt-1")}
                >
                  {Array.from({ length: Math.max(1, form.due.remainingMonths) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "This month only" : `${n} months`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-ink-600">
              In a series, marking a payout paid queues the next month as pending, until the series or the placement ends.
            </p>
            <label className="block text-sm font-medium text-ink-700">
              Note for the team (optional)
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                maxLength={500}
                className={cn(inlineFieldClass, "mt-1")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={busy !== null} className={buttonClass({ variant: "primary", size: "sm" })}>
                {busy === "create" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                Create pending payout
              </button>
              <button type="button" onClick={() => setForm(null)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/* Payouts */}
      <section aria-labelledby="payouts-head" className="space-y-3">
        <h4 id="payouts-head" className="text-base font-semibold text-ink-900">Payouts</h4>
        {sorted.length === 0 ? (
          <p className="rounded-apple-md border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-600">
            Nothing recorded yet. Create the first payout from a placement above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-apple-md border border-ink-200/80">
            <table className="w-full min-w-[52rem] text-left">
              <caption className="sr-only">Payouts recorded for this intern</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Scheduled</th>
                  <th scope="col" className={th}>Placement</th>
                  <th scope="col" className={cn(th, "text-right")}>Amount</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Reference</th>
                  <th scope="col" className={th}>Paid on</th>
                  <th scope="col" className={th}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {sorted.map((p) => {
                  const raw = rawOf(p);
                  const proposalId = str(raw.proposalId) ?? str(raw.proposal_id);
                  const opsNote = str(raw.opsNote);
                  const scheduled = str(raw.scheduledFor) ?? str(raw.scheduled_for);
                  return (
                    <tr key={p.id}>
                      <td className={cn(td, "nums whitespace-nowrap")}>{scheduled ? formatDate(scheduled) : "-"}</td>
                      <td className={td}>
                        {proposalId ? placementLabel.get(proposalId) ?? "Placement" : <span className="text-ink-500">Not linked</span>}
                        {opsNote ? (
                          <span className="block max-w-64 truncate text-xs text-ink-600" title={opsNote}>
                            {opsNote}
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(td, "nums whitespace-nowrap text-right font-semibold text-ink-900")}>
                        {formatMoney(p.amountMinor, p.currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" })}
                      </td>
                      <td className={td}>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className={cn(td, "nums")}>{p.referenceId ?? <span className="text-ink-500">-</span>}</td>
                      <td className={cn(td, "nums whitespace-nowrap")}>{p.paidAt ? formatDate(p.paidAt) : "-"}</td>
                      <td className={cn(td, "text-right")}>
                        {p.status === "pending" ? (
                          <PayoutEditor payoutId={p.id} status={p.status} initialReference={p.referenceId} initialNote={opsNote} />
                        ) : p.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => resendEmail(p)}
                            disabled={busy !== null}
                            className={buttonClass({ variant: "ghost", size: "sm" })}
                          >
                            {busy === `mail:${p.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
                            Resend email
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm font-medium text-brand-700">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
