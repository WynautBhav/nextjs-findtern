"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { PageHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";

/**
 * The error state for an intern screen whose data could not be read. A failed
 * query is said out loud, never shown as "nothing here" (DESIGN.md §0).
 */
export function InternRouteError({
  title,
  what,
  error,
  retry,
}: {
  title: string;
  /** What could not be loaded, e.g. "your offers". */
  what: string;
  error: Error & { digest?: string };
  retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <PageHead title={title} />
      <Surface className="flex flex-col items-start gap-4 p-5 sm:flex-row lg:p-6 sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-apple-sm bg-danger-soft text-danger">
            <AlertCircle className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">We couldn&apos;t load {what}</h2>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">
              Nothing has changed on your account. Try again in a moment; if it keeps happening, write to{" "}
              <a href="mailto:communicate@findtern.in" className="font-medium text-brand-700 underline underline-offset-4">
                communicate@findtern.in
              </a>
              .
            </p>
          </div>
        </div>
        {retry ? (
          <button type="button" onClick={() => retry()} className={buttonClass({ variant: "primary", size: "md", className: "text-sm font-semibold" })}>
            <RotateCw className="size-4" aria-hidden />
            Try again
          </button>
        ) : null}
      </Surface>
    </div>
  );
}
