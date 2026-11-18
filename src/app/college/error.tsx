"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { recoverFromChunkError, retryOrReload } from "@/lib/chunk-error";

/**
 * A failed read on any college screen lands here, inside the shell, instead of
 * rendering "nothing yet" as if the data were empty (DESIGN.md §0, States).
 */
export default function CollegeError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    recoverFromChunkError(error);
  }, [error]);

  return (
    <div role="alert" className="mt-6 max-w-xl border-t border-ink-200 pt-8">
      <h1 className="text-balance text-2xl font-semibold text-ink-900">
        This page could not load
      </h1>
      <p className="mt-3 max-w-md text-pretty text-base text-ink-700">
        Your data is safe; we just could not read it right now. Try again in a moment. If it keeps happening, write to
        communicate@findtern.in{error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => retryOrReload(error, retry)} className={buttonClass({})}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </button>
        <Link href="/college" className={buttonClass({ variant: "outline" })}>
          Back to students
        </Link>
      </div>
    </div>
  );
}
