"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/**
 * Live actions on a proposal detail page.
 *
 * Withdraw posts to the status route (employer-owned, state-machine guarded
 * server-side). Accepted offers move to checkout - that payment is what flips
 * the proposal to hired. Edit is handled by the sibling `ProposalOfferForm`.
 */
export function ProposalActions({
  proposalId,
  status,
}: {
  proposalId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function withdraw() {
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/proposals/${encodeURIComponent(proposalId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not withdraw - try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "accepted") {
    return (
      <Link
        href="/employer/checkout"
        className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-700 px-4 text-sm font-semibold text-white shadow-2xs hover:bg-emerald-800"
      >
        Proceed to checkout - payment completes the hire
      </Link>
    );
  }

  if (status === "hired") {
    return (
      <p className="text-sm leading-relaxed text-ink-700">
        Hired - payment cleared and the candidate&apos;s name is now visible to you.
      </p>
    );
  }

  if (status !== "draft" && status !== "sent") return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-ink-200/70 bg-white px-4 text-sm font-medium text-ink-700 hover:border-red-300 hover:text-red-700"
      >
        Withdraw proposal
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-ink-600">
        The candidate will no longer be able to accept it. This cannot be undone.
      </p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <button
          type="button"
          onClick={withdraw}
          disabled={busy}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Confirm withdrawal
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-ink-200/70 bg-white px-4 text-xs font-medium text-ink-600 hover:bg-ink-50"
        >
          Keep proposal
        </button>
      </div>
    </div>
  );
}
