"use client";

/**
 * Move the whole shortlist into the checkout set.
 *
 * Staging is what makes a checkout possible: the checkout page bills *accepted
 * proposals*, and the staged set is the employer's own statement of intent that
 * sits underneath them. Legacy called this `cart/sync`.
 *
 * This stages every shortlisted candidate. Per-candidate staging is available on
 * the cart page; promoting a single row is the rarer case, and a button per row
 * for an action the employer almost always wants in bulk is noise.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

export function StageAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function stage() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stage_all" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not stage the shortlist.");
      setDone(data.staged ?? count);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stage the shortlist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5">
      <p className="text-sm font-semibold text-ink-900">Ready to hire from this shortlist?</p>
      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-600">
        Staging moves all {count} shortlisted candidate{count === 1 ? "" : "s"} into checkout. You
        can still remove anyone afterwards — staging is a shortlist, not a commitment.
      </p>
      <button
        type="button"
        onClick={stage}
        disabled={busy || done !== null}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
        {done !== null ? "Staged" : `Stage ${count} for checkout`}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}