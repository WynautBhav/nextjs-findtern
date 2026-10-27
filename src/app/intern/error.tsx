"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";

/**
 * A failed read on any intern screen lands here, inside the shell, instead of
 * rendering "nothing yet" as if the data were empty (DESIGN.md §0, States).
 */
export default function InternError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Surface role="alert" className="mx-auto mt-6 max-w-xl p-8 text-center sm:p-10">
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900">
        This page could not load
      </h1>
      <p className="mx-auto mt-3 max-w-md text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
        Your data is safe; we just could not read it right now. Try again in a moment. If it keeps happening, write to
        communicate@findtern.in{error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={buttonClass({})}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </button>
        <Link href="/intern/dashboard" className={buttonClass({ variant: "outline" })}>
          Back to home
        </Link>
      </div>
    </Surface>
  );
}
