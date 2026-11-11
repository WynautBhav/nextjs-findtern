"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import type { WalletLedgerRow, WalletSummary } from "@/lib/college/wallet-read";

/** Admin: a college's wallet (balance, open request, ledger, masked bank) and the Mark paid / Reject controls. */
export type CollegeWalletPanelProps = {
  collegeId: string;
  summary: WalletSummary;
  ledger: WalletLedgerRow[];
  /** Masked bank card; null when the college has no bank on file. */
  bank: { holder: string; bankName: string; last4: string; ifsc: string } | null;
  /** Mark paid / Reject / Reveal render only when true. */
  canMoney: boolean;
};

const inr = (n: number) => formatMoney(n, "INR", { zeroLabel: false });

export function CollegeWalletPanel({ collegeId, summary, ledger, bank, canMoney }: CollegeWalletPanelProps) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [full, setFull] = useState<string | null>(null);
  const open = summary.openRequest;

  async function call(url: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Something went wrong.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function settle(action: "paid" | "reject") {
    if (!open) return;
    const ok = await ask(
      action === "paid"
        ? { title: "Mark this withdrawal paid?", body: `${inr(open.amountMinor)} will be debited from the wallet. Only do this after the bank transfer is sent.`, confirmLabel: "Yes, mark paid" }
        : { title: "Reject this withdrawal?", body: "Nothing is debited. The college is told the reason.", confirmLabel: "Yes, reject", destructive: true },
    );
    if (!ok) return;
    const data = await call(`/api/admin/colleges/${collegeId}/payouts/${open.id}`, action === "paid" ? { action, referenceId: ref } : { action, reason });
    if (data) router.refresh();
  }

  async function reveal() {
    const data = await call(`/api/admin/colleges/${collegeId}/bank`, {});
    if (data) setFull(data.value);
  }

  return (
    <section className="space-y-4" aria-label="Wallet">
      <dl className="grid gap-3 sm:grid-cols-3 text-sm">
        <div><dt className="text-text-subtle">Balance</dt><dd className="nums text-xl font-semibold">{inr(summary.balanceMinor)}</dd></div>
        <div><dt className="text-text-subtle">Waiting for payout</dt><dd className="nums text-xl font-semibold">{inr(open?.amountMinor ?? 0)}</dd></div>
        <div><dt className="text-text-subtle">Available</dt><dd className="nums text-xl font-semibold">{inr(summary.availableMinor)}</dd></div>
      </dl>

      <div className="text-sm">
        <p className="font-medium">Bank account</p>
        {bank ? (
          <p className="nums text-text-subtle">
            {bank.holder} · {bank.bankName} · {full ?? `•••• ${bank.last4}`} · {bank.ifsc}
            {canMoney && !full ? <button type="button" onClick={reveal} disabled={busy} className="ml-3 inline-flex min-h-9 items-center px-1 underline touch:min-h-11 touch:min-w-11 touch:justify-center">Reveal</button> : null}
          </p>
        ) : (
          <p className="text-text-subtle">None on file.</p>
        )}
      </div>

      {open ? (
        <div className="space-y-3 rounded-lg bg-ink-50 p-4 text-sm">
          <p className="font-medium">Withdrawal requested: {inr(open.amountMinor)} on {formatDate(open.createdAt)}</p>
          {canMoney ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <input aria-label="Bank reference" placeholder="Bank reference (UTR)" maxLength={64} value={ref} onChange={(e) => setRef(e.target.value)} className="h-9 w-56 rounded-md border border-ink-200 bg-surface px-3 text-sm touch:h-11" />
                <button type="button" disabled={busy || !ref.trim()} onClick={() => settle("paid")} className={buttonClass({ size: "sm" })}>Mark paid</button>
              </div>
              <div className="flex items-center gap-2">
                <input aria-label="Rejection reason" placeholder="Reason (3+ characters)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 w-56 rounded-md border border-ink-200 bg-surface px-3 text-sm touch:h-11" />
                <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => settle("reject")} className={buttonClass({ variant: "outline", size: "sm" })}>Reject</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {msg ? <p role="status" className="text-sm text-red-600">{msg}</p> : null}

      <ul className="divide-y divide-ink-200/80 text-sm">
        {ledger.slice(0, 20).map((r) => (
          <li key={r.id} className="flex justify-between gap-3 py-2">
            <span className="min-w-0 truncate">
              {formatDate(r.at)} · {r.kind === "payout" ? `Withdrawal paid (${r.referenceId ?? "no ref"})` : r.kind === "payout_rejected" ? `Withdrawal rejected: ${r.rejectReason ?? ""}` : r.kind === "incentive" ? `Incentive: ${r.student}` : "Adjustment"}
            </span>
            <span className="nums shrink-0 font-medium">{inr(r.amountMinor)}</span>
          </li>
        ))}
        {ledger.length === 0 ? <li className="py-2 text-text-subtle">No activity yet.</li> : null}
      </ul>
      {dialog}
    </section>
  );
}
