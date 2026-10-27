"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { PageHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";

/**
 * What an intern screen shows when its data could not be read: a real
 * error inside the shell, with a retry, never an empty list that reads as
 * "you have nothing". Used by segment `error.tsx` files.
 */
export function LoadError({
  title,
  what,
  error,
  retry,
}: {
  title: string;
  /** "your timesheets", "your stipend". */
  what: string;
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <PageHead title={title} />
      <Surface className="flex flex-col items-start gap-4 p-6 sm:p-8" role="alert">
        <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
          <AlertCircle className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">We could not load {what}</h2>
          <p className="mt-1.5 max-w-xl text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
            Nothing has been lost. This is a problem reading it right now, not with your account. Try again in a
            moment; if it keeps happening, write to communicate@findtern.in.
          </p>
          {error.digest ? <p className="mt-2 text-xs text-ink-600">Reference {error.digest}</p> : null}
        </div>
        <button type="button" onClick={() => retry()} className={buttonClass({ variant: "primary", size: "md" })}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </button>
      </Surface>
    </div>
  );
}
