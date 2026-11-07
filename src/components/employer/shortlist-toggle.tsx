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
import { Bookmark, Check, Loader2, Plus } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export function ShortlistToggle({
  internId,
  projectId,
  shortlisted,
  size = "md",
  emphasis = "quiet",
  variant: look = "labelled",
  alsoOn,
  className,
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  size?: "sm" | "md";
  /** "primary" while not shortlisted: the filled brand button. */
  emphasis?: "primary" | "quiet";
  /** "icon": a quiet bookmark for a card corner; the label stays for assistive tech. */
  variant?: "labelled" | "icon";
  /** Names of other projects this candidate is already shortlisted for; shown under the button. */
  alsoOn?: string[];
  /** Applied to the wrapper; the button always fills it. */
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(shortlisted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
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
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the shortlist. Try again.");
      setState(!state);
      router.refresh();
    } catch (e) {
      // fetch rejects with a TypeError ("Failed to fetch") when offline; never show that raw.
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
    } finally {
      setBusy(false);
    }
  }

  const variant = state ? "outline" : emphasis === "primary" ? "primary" : "outline";

  if (look === "icon") {
    const label = state ? "Shortlisted: remove from shortlist" : "Add to shortlist";
    return (
      <span className={cn("inline-flex", className)}>
        <Tooltip>
        <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-disabled={busy || undefined}
          aria-pressed={state}
          aria-label={label}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full outline-none transition-colors hover:bg-ink-100 focus-visible:ring-[3px] focus-visible:ring-brand-600/30",
            state ? "text-brand-700" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Bookmark className={cn("size-5", state && "fill-current")} aria-hidden />
          )}
        </button>
        </TooltipTrigger>
        <TooltipContent>{error ?? label}</TooltipContent>
        </Tooltip>
        {error ? <span role="alert" className="sr-only">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 flex-col items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        // Not `disabled`: that drops keyboard focus to the page while it saves.
        aria-disabled={busy || undefined}
        aria-pressed={state}
        title={state ? "Remove from your shortlist" : "Add to your shortlist for this project"}
        className={buttonClass({ variant, size: size === "sm" ? "sm" : "md", block: true, className: size === "sm" ? "min-h-11" : undefined })}
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
