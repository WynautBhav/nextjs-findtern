"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { recoverFromChunkError, retryOrReload } from "@/lib/chunk-error";
import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";

/**
 * What a screen shows when its data could not be read: a real error with a
 * retry, never an empty list that reads as "you have nothing" (DESIGN.md §0).
 * Deliberately not `EmptyScene`: solid danger border, alert icon, `role="alert"`.
 *
 * Retry is `onRetry` in an error boundary (`retry` from `error.tsx`) or
 * `retryHref` on a server page (a plain link to the same URL, so the query runs again).
 * Renders the card only; the caller keeps its own `PageHead`.
 */
export function LoadError({
  what,
  error,
  onRetry,
  retryHref,
  email = SITE.email,
  className,
}: {
  /** "your timesheets", "your stipend". */
  what: string;
  error?: Error & { digest?: string };
  onRetry?: () => void;
  retryHref?: string;
  /** Who to write to; employers pass `SITE.adminEmail`. */
  email?: string;
  className?: string;
}) {
  useEffect(() => {
    if (error) {
      console.error(error);
      recoverFromChunkError(error);
    }
  }, [error]);

  const retryClass = buttonClass({ variant: "primary", size: "md" });
  return (
    <Surface
      role="alert"
      className={cn("flex flex-col items-start gap-4 border-danger/40 bg-danger-soft/40 p-5 in-data-[tone=light]:border-danger/40 sm:p-6", className)}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink-900">We couldn&apos;t load {what}</h2>
        <p className="mt-1.5 max-w-xl text-pretty text-sm leading-relaxed text-ink-600">
          Nothing has changed on your account; this is a problem reading it right now. Try again in a moment. If it keeps
          happening, write to{" "}
          <a href={`mailto:${email}`} className="font-medium text-brand-700 underline underline-offset-4">
            {email}
          </a>
          .
        </p>
        {error?.digest ? <p className="mt-2 text-xs text-ink-600">Reference {error.digest}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" onClick={() => retryOrReload(error, onRetry)} className={retryClass}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </button>
      ) : retryHref ? (
        <a href={retryHref} className={retryClass}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </a>
      ) : null}
    </Surface>
  );
}
