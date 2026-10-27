"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * Pay and withdraw on the proposal page. What is allowed comes from
 * `offerState` (shared with the list), so the page never offers an action
 * the server refuses. Edit is the sibling `ProposalOfferForm`.
 */
export function ProposalActions({
  proposalId,
  status,
  canPay,
  canWithdraw,
}: {
  proposalId: string;
  status: string;
  canPay: boolean;
  canWithdraw: boolean;
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
        setError(json?.error ?? "The offer wasn't withdrawn. Try again.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("You appear to be offline. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "hired") {
    return <p className="text-sm leading-relaxed text-ink-700">Payment cleared. The candidate&apos;s name and contact details are visible to you.</p>;
  }

  return (
    <>
      {canPay ? (
        <Link href="/employer/checkout" className={buttonClass({ block: true })}>
          <CreditCard className="size-4" aria-hidden />
          Proceed to checkout
        </Link>
      ) : null}
      {canWithdraw && !confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className={buttonClass({ variant: "outline", block: true })}>
          Withdraw offer
        </button>
      ) : null}
      {canWithdraw && confirming ? (
        <div className="space-y-2 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
          <p className="text-sm leading-relaxed text-ink-700">
            {status === "accepted"
              ? "The candidate accepted this offer. Withdrawing tells them it won't go ahead. This can't be undone."
              : "The candidate can no longer accept it, and they are told. This can't be undone."}
          </p>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button type="button" onClick={withdraw} disabled={busy} className={buttonClass({ variant: "dark", size: "sm" })}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Withdraw offer
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
