"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * "Confirm and continue": the employer accepts the score Findtern corrected, which opens payment. It calls the same
 * route wherever it is shown (the list card and the proposal page) and refreshes the server data afterwards.
 * The route answers 409 when there is nothing to confirm (already confirmed, or the offer changed): the page is
 * refreshed then too, so the screen shows what is true instead of a dead button.
 */
export function CgpaAckButton({ proposalId, className }: { proposalId: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/proposals/${encodeURIComponent(proposalId)}/cgpa-ack`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(json?.error ?? "That didn't go through. Try again.");
      // Nothing left to confirm: show the page as it is now.
      if (res.status === 409) router.refresh();
    } catch {
      setError("You appear to be offline. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => void confirm()} disabled={busy} aria-busy={busy} className={buttonClass({ block: true, className: "min-h-11" })}>
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
        Confirm and continue
      </button>
      <p role="alert" className={error ? "mt-2 text-sm font-medium text-danger" : "sr-only"}>
        {error}
      </p>
    </div>
  );
}

/**
 * Pay and withdraw on the proposal page. What is allowed comes from
 * `offerState` (shared with the list, read from lib/proposal-permissions.ts), so the page never offers an action
 * the server refuses. Edit is the sibling `ProposalOfferForm`.
 *
 * Withdraw confirms in a dialog with Cancel focused (QA-115). The inline
 * panel it replaced put its own "Withdraw offer" where the first button had
 * been, so a double click withdrew the offer.
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
  const [error, setError] = useState("");
  const { ask, dialog } = useConfirm();

  async function withdraw() {
    const ok = await ask({
      title: "Withdraw this offer?",
      body: "The candidate can no longer accept it, and they are told. This can't be undone.",
      confirmLabel: "Yes, withdraw the offer",
    });
    if (!ok) return;
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
      {canWithdraw ? (
        <button
          type="button"
          onClick={() => void withdraw()}
          disabled={busy}
          className={buttonClass({ variant: "ghost", block: true, className: "min-h-11 text-ink-700 hover:bg-danger-soft hover:text-danger" })}
        >
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Withdraw offer
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {dialog}
    </>
  );
}
