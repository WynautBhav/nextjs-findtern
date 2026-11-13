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
 * steps back to an outline button (named "Shortlisted", aria-pressed) that removes on press.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { useOptimisticToggle } from "@/hooks/use-optimistic-toggle";
import { saveFailureMessage } from "@/lib/fetch-error";

export function ShortlistToggle({
  internId,
  projectId,
  shortlisted,
  size = "md",
  emphasis = "quiet",
  alsoOn,
  className,
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  size?: "sm" | "md";
  /** "primary" while not shortlisted: the filled brand button. */
  emphasis?: "primary" | "quiet";
  /** Names of other projects this candidate is already shortlisted for; shown under the button. */
  alsoOn?: string[];
  /** Applied to the wrapper; the button always fills it. */
  className?: string;
}) {
  const router = useRouter();
  // Flips the instant it is pressed; back to the true state if the server says no.
  const { value: state, pending: busy, toggle: flip } = useOptimisticToggle(shortlisted);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    flip(async (next) => {
      try {
        const res = await csrfFetch("/api/employer/cart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: next ? "add" : "remove",
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
          return false;
        }
        if (!res.ok) throw new Error(data.error ?? "Couldn't update the shortlist. Try again.");
        router.refresh();
        return true;
      } catch (e) {
        setError(saveFailureMessage(e));
        return false;
      }
    });
  }

  const variant = state ? "outline" : emphasis === "primary" ? "primary" : "outline";

  return (
    <span className={cn("inline-flex min-w-0 flex-col items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        // Not `disabled`: that drops keyboard focus to the page while it saves.
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-pressed={state}
        title={state ? "Remove from your shortlist" : "Add to your shortlist for this project"}
        className={buttonClass({ variant, size: size === "sm" ? "sm" : "md", block: true, className: size === "sm" ? "min-h-11" : undefined })}
      >
        {/* The heart the candidate list uses for the same shortlist. */}
        <Heart className={cn("size-4", state && "fill-current")} aria-hidden />
        {state ? "Shortlisted" : "Shortlist"}
      </button>
      {alsoOn && alsoOn.length > 0 ? (
        <span className="text-xs text-ink-600">Also shortlisted for {alsoOn.join(", ")}</span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
