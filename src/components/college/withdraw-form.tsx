"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";

/** Request a withdrawal. `blockedReason` disables the form with the reason shown. */
export function WithdrawForm({ availableMinor, blockedReason }: { availableMinor: number; blockedReason: string | null }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [rupees, setRupees] = useState(String(availableMinor / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountMinor = Math.round(Number(rupees) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) return setMsg("Enter an amount above zero.");
    const ok = await ask({
      title: "Request this withdrawal?",
      body: `${formatMoney(amountMinor, "INR", { zeroLabel: false })} will be sent to your bank account on file once Findtern pays it.`,
      confirmLabel: "Yes, request",
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/college/payouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data.error ?? "Could not request. Try again.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-text-subtle">Amount (₹)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={rupees}
          disabled={Boolean(blockedReason)}
          onChange={(e) => setRupees(e.target.value)}
          className="nums mt-1 w-40 rounded-md border border-ink-200 px-3 py-2"
        />
      </label>
      <button type="submit" disabled={busy || Boolean(blockedReason)} className={buttonClass({ size: "sm" })}>{busy ? "Requesting…" : "Request withdrawal"}</button>
      {blockedReason || msg ? <p role="status" className="basis-full text-sm text-text-subtle">{blockedReason ?? msg}</p> : null}
      {dialog}
    </form>
  );
}
