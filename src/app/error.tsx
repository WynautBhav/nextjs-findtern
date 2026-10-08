"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-text-subtle">An unexpected error occurred. Please try again.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
        Try again
      </button>
    </div>
  );
}
