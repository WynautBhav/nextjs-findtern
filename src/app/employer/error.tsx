"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCw } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";

/** A failed read anywhere in the employer console lands here, inside the shell. No stack trace, only a reference code. */
export default function EmployerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className={cn(SURFACE_CLASS, "mx-auto mt-4 flex max-w-xl flex-col items-center p-8 text-center sm:p-10")}>
      <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertCircle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-balance text-xl font-semibold tracking-[-0.01em] text-ink-900">We couldn&apos;t load this page</h1>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-ink-600">
        Something went wrong while reading your data. Nothing on your account has changed. Try again; if it keeps happening, write to{" "}
        <a href={`mailto:${SITE.adminEmail}`} className="font-medium text-brand-700 underline underline-offset-4">
          {SITE.adminEmail}
        </a>
        {error.digest ? <> and quote reference <span className="nums font-medium text-ink-800">{error.digest}</span></> : null}.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={buttonClass({})}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </button>
        <Link href="/employer/dashboard" className={buttonClass({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
