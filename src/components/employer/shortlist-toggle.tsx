"use client";

/**
 * Shortlist toggle - the "add to cart" button, and its removal.
 *
 * The legacy employer flow was browse → shortlist → compare → checkout, and the
 * shortlist was the hinge: nothing else in that chain means anything without it.
 *
 * One component covers both directions so the button and its "remove" twin can
 * never disagree about what is currently shortlisted. Before shortlisting it
 * is the card's one primary action (`emphasis="primary"`); once shortlisted it
 * steps back to an outline "Shortlisted" that removes on press.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export function ShortlistToggle({
  internId,
  projectId,
  shortlisted,
  size = "md",
  emphasis = "quiet",
  className,
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  size?: "sm" | "md";
  /** "primary" while not shortlisted: the filled brand button. */
  emphasis?: "primary" | "quiet";
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
      // An offer is already out (or they are hired): go to it, as legacy did
      // from compare (employer-compare.tsx:457).
      if (res.status === 409 && typeof data.proposalId === "string") {
        router.push(`/employer/proposal/${encodeURIComponent(data.proposalId)}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not update your shortlist.");
      setState(!state);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your shortlist.");
    } finally {
      setBusy(false);
    }
  }

  const variant = state ? "outline" : emphasis === "primary" ? "primary" : "outline";

  return (
    <span className={cn("inline-flex min-w-0 flex-col items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state}
        title={state ? "Remove from your shortlist" : "Add to your shortlist for this project"}
        className={buttonClass({ variant, size: size === "sm" ? "sm" : "md", block: true, className: size === "sm" ? "min-h-10" : undefined })}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : state ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {state ? "Shortlisted" : "Shortlist"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
