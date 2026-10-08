"use client";

/**
 * Shortlist toggle — the "add to cart" button, and its removal.
 *
 * The legacy employer flow was browse → shortlist → compare → checkout, and the
 * shortlist was the hinge: nothing else in that chain means anything without it.
 * The rewrite had the `employer_cart_items` table and no way to write to it, so
 * candidates could be read but never kept.
 *
 * One component covers both directions so the button and its "remove" twin can
 * never disagree about what is currently shortlisted.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

export function ShortlistToggle({
  internId,
  projectId,
  shortlisted,
  size = "md",
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [state, setState] = useState(shortlisted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: state ? "remove" : "add",
          projectId,
          internId,
          listType: "cart",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update your shortlist.");
      setState(!state);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your shortlist.");
    } finally {
      setBusy(false);
    }
  }

  const pad = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state}
        className={
          state
            ? `inline-flex ${pad} items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 font-medium text-brand-800 transition-colors disabled:opacity-60`
            : `inline-flex ${pad} items-center gap-1.5 rounded-lg border border-ink-200 bg-white font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-60`
        }
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : state ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
        {state ? "Shortlisted" : "Shortlist"}
      </button>
      {error ? <span className="text-2xs text-danger">{error}</span> : null}
    </span>
  );
}