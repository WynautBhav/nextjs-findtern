"use client";

import { useEffect } from "react";

import { buttonClass } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-text-subtle">An unexpected error occurred. Please try again.</p>
      <button type="button" onClick={() => retry()} className={buttonClass({ className: "mt-6" })}>
        Try again
      </button>
    </div>
  );
}
