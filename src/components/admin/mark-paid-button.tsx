"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { sendInline } from "@/components/admin/inline-control";
import { buttonClass } from "@/components/ui/button";

const input = "h-9 rounded-apple-sm border border-ink-200 bg-surface px-3 text-sm text-ink-900";

/** For an intern who paid the activation fee off-platform. Reference is required; amount defaults to the standard fee. */
export function MarkPaidButton({ internId }: { internId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
        Mark activation paid
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await sendInline(
      { url: `/api/admin/interns/${encodeURIComponent(internId)}/mark-paid`, method: "POST" },
      { reference, ...(amount.trim() ? { amountRupees: Number(amount) } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) },
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input aria-label="Payment reference" className={input} placeholder="Bank / UTR reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <input aria-label="Amount in rupees" className={`${input} w-28`} inputMode="decimal" placeholder="₹ 2,499" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input aria-label="Reason, needed when the amount is not the standard fee" className={`${input} w-56`} placeholder="Reason (if not the standard fee)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" onClick={submit} disabled={busy || reference.trim().length < 3 || (amount.trim() !== "" && !(Number(amount) > 0))} className={buttonClass({ variant: "outline", size: "sm" })}>
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        Confirm paid
      </button>
      {error ? <span role="alert" className="text-xs font-medium text-danger">{error}</span> : null}
    </span>
  );
}
