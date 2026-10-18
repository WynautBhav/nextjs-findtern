"use client";

/**
 * Shortlist toggle - the "add to cart" button, and its removal.
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
  className,
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  size?: "sm" | "md";
  /** Applied to the wrapper; the button always fills it. */
  className?: string;
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

  const pad = size === "sm" ? "min-h-11 px-3 text-[13px]" : "min-h-11 px-4 text-sm";

  return (
    <span className={`inline-flex min-w-0 flex-col items-stretch gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state}
        className={
          state
            ? `apple-spring apple-pressable inline-flex w-full ${pad} items-center justify-center gap-1.5 rounded-[10px] border border-brand-300 bg-brand-50 font-medium text-brand-800 disabled:opacity-60`
            : `apple-spring apple-pressable inline-flex w-full ${pad} items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-60`
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
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}