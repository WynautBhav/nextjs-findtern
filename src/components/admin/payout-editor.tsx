"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Row-level payout editor for the disbursements table.
 *
 * Bank transfers happen outside the app, so the ledger needs a hand: pick a
 * new status, type the UTR / bank reference, save. Completed requires the
 * reference (the API enforces it too). Only rendered for pending rows - a
 * settled payout is history, not a draft.
 */
export function PayoutEditor({
  payoutId,
  initialReference,
}: {
  payoutId: string;
  initialReference: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"paid" | "failed">("paid");
  const [reference, setReference] = useState(initialReference ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, referenceId: reference }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save - try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200/70 bg-white px-3 text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800"
      >
        <Pencil className="size-3.5" aria-hidden />
        Update
      </button>
    );
  }

  return (
    <div className="min-w-52 space-y-2 rounded-[10px] border border-ink-200/70 bg-ink-50/60 p-3">
      <div className="flex gap-1.5">
        {(["paid", "failed"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatus(option)}
            aria-pressed={status === option}
            className={cn(
              "min-h-11 flex-1 rounded-[10px] border px-2 text-xs font-semibold capitalize",
              status === option
                ? option === "paid"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-red-600 bg-red-50 text-red-800"
                : "border-ink-200/70 bg-white text-ink-600 hover:bg-ink-50",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-2xs font-semibold tracking-wide text-ink-600 uppercase">
          Bank reference {status === "paid" ? "(required)" : "(optional)"}
        </span>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="UTR / NEFT reference…"
          className="min-h-11 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-ink-200/70 bg-white px-3 text-xs font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
